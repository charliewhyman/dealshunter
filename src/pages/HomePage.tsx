import { useEffect, useRef, useState } from 'react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';

const ITEMS_PER_PAGE = 10;

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [vendors, setVendors] = useState<string[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);

  // TODO add filtering by product tag/type
  // TODO add sorting by votes
  // TODO add filtering by offer or price reduction

  // Fetch unique vendors on component mount
  useEffect(() => {
    async function fetchVendors() {
      const { data, error } = await supabase
        .from('distinct_vendors')
        .select('vendor')
        .order('vendor', { ascending: true });
              
      if (data && !error) {
        setVendors(data.map(item => item.vendor).filter(Boolean));
      }
    }
    fetchVendors();
  }, []);

  useEffect(() => {
    async function fetchProducts(page: number) {
      setLoading(true);
      try {
        let query = supabase
          .from('products')

          .select(`
            *,
            variants (available),
            offers (availability)
          `)
          .order('votes', { ascending: false });

        if (selectedVendor) {
          query = query.eq('vendor', selectedVendor);
        }

        if (inStockOnly) {
          query = query
            .eq('variants.available', true)
            .eq('offers.availability', 'https://schema.org/InStock');
        }

        const { data, error } = await query
          .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
    
        if (error) throw error;
    
        if (data) {
          setProducts((prev) => {
            const existingIds = new Set(prev.map((product) => product.id));
            const uniqueProducts = data.filter((product) => !existingIds.has(product.id));
            return page === 0 ? data : [...prev, ...uniqueProducts];
          });
          setHasMore(data.length > 0);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts(page);

  }, [page, selectedVendor, inStockOnly]);
  
  // Filter out-of-stock products
  useEffect(() => {
    async function filterInStockProducts() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            offers!inner (
              availability
            )
          `)
          .eq('offers.availability', 'https://schema.org/InStock')
          .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1)
          .order('votes', { ascending: false });

        if (error) throw error;

        if (data) {
          setProducts((prev) => {
            const existingIds = new Set(prev.map((product) => product.id));
            const uniqueProducts = data.filter((product) => !existingIds.has(product.id));
            return page === 0 ? data : [...prev, ...uniqueProducts];
          });
          setHasMore(data.length > 0);
        }
      } catch (error) {
        console.error('Error filtering products:', error);
      } finally {
        setLoading(false);
      }
    }

    filterInStockProducts();
  }, [page]);

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

      <div className="mb-6 flex gap-4 items-center">
        <select 
          value={selectedVendor}
          onChange={(e) => {
            setSelectedVendor(e.target.value);
            setPage(0);
            setProducts([]);
          }}
          className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 bg-white shadow-md hover:shadow-lg transition-shadow cursor-pointer font-semibold text-gray-900"
        >
          <option value="">All Vendors</option>
          {vendors.map((vendor) => (
            <option key={vendor} value={vendor}>
              {vendor}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => {
              setInStockOnly(e.target.checked);
              setPage(0);
              setProducts([]);
            }}
            className="rounded border-gray-300"
          />
          <span className="font-semibold text-gray-900">In Stock Only</span>
        </label>
      </div>
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