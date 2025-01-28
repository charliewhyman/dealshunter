import { useEffect, useRef, useState } from 'react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';

const ITEMS_PER_PAGE = 10;

export function HomePage() {
  // State management for products list and infinite scroll
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  // Ref for intersection observer to detect when user reaches bottom of page
  const observerRef = useRef<HTMLDivElement | null>(null);

  // Fetch products whenever page number changes
  useEffect(() => {
    fetchProducts(page);
  }, [page]);

  // Fetches paginated products from Supabase
  async function fetchProducts(page: number) {
    setLoading(true);
    try {
      // Query products table with pagination, ordered by votes
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('votes', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
  
      if (error) throw error;
  
      if (data) {
        // Update products state, ensuring no duplicates
        setProducts((prev) => {
          const existingIds = new Set(prev.map((product) => product.id));
          const uniqueProducts = data.filter((product) => !existingIds.has(product.id));
          return [...prev, ...uniqueProducts];
        });
        // Check if there might be more products to load
        setHasMore(data.length > 0);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    // Create observer that triggers when last element becomes visible
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 1.0 }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    const currentRef = observerRef.current;
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };  }, [hasMore, loading]);

  // Handle voting on products
  const handleVote = async (productId: number) => {
    try {
      // Call Supabase RPC function to increment votes
      const { error } = await supabase.rpc('increment_votes', {
        product_id: productId,
      });

      if (error) throw error;

      // Optimistically update the UI before server confirmation
      setProducts((prev) =>
        prev.map((product) =>
          product.id === productId ? { ...product, votes: (product.votes ?? 0) + 1 } : product
        )
      );
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {products.map((product) => (
          <div key={product.id} className="max-w-4xl mx-auto w-full">
            <ProductCard product={product} onVote={(productId: number) => handleVote(Number(productId))} />
          </div>
        ))}
      </div>
      <div
        ref={observerRef}
        className="flex items-center justify-center py-8"
      >
        {loading && <Loader2 className="w-8 h-8 animate-spin" />}
      </div>
    </div>
  );
}
