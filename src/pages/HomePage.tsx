import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2, Search } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import Select from 'react-select';
import { MultiValue } from 'react-select';

const ITEMS_PER_PAGE = 10;

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopNames, setShopNames] = useState<string[]>([]);
  const [selectedShopName, setSelectedShopName] = useState<string[]>([]);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch unique shop names on component mount
  useEffect(() => {
    async function fetchShopNames() {
      const { data, error } = await supabase
        .from('distinct_shop_names')
        .select('shop_name')
        .order('shop_name', { ascending: true });

      if (data && !error) {
        setShopNames(data.map(item => item.shop_name).filter(Boolean));
      }
    }
    fetchShopNames();
  }, []);

  useEffect(() => {
    async function fetchProducts(page: number) {
      setLoading(true);
      try {
        let query = supabase
          .from('products')
          .select(`
            *,
            variants:variants!inner(*),
            offers (*)
          `);

        if (selectedShopName.length > 0) {
          const shopNameConditions = selectedShopName.map(name => `shop_name.ilike.%${name}%`).join(',');
          query = query.or(shopNameConditions);
        }

        if (inStockOnly) {
          query = query
            .eq('variants.available', true)
            .eq('offers.availability', 'https://schema.org/InStock');
        }

        if (onSaleOnly) {
          query = query
            .not('offers.id', 'is', null)
            .eq('variants.is_price_lower', true);
        }

        if (searchQuery) {
          query = query.textSearch('title', searchQuery);
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

  }, [page, selectedShopName, inStockOnly, onSaleOnly, searchQuery]);

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
    };
  }, [hasMore, loading]);

  const handleShopChange = (selectedOptions: MultiValue<{ value: string; label: string }>) => {
    const selectedValues = selectedOptions ? selectedOptions.map((option) => option.value) : [];
    setSelectedShopName(selectedValues);
    setPage(0);
    setProducts([]);
  };

  const shopOptions = shopNames.map((shopName) => ({
    value: shopName,
    label: shopName,
  }));

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const onSearch = (query: string) => {
    console.log('Searching for:', query);
  };

  const handleSearchSubmit = (e:FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSearch(searchQuery);
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex gap-4 items-center">
        <Select
          isMulti
          options={shopOptions}
          value={shopOptions.filter(option => selectedShopName.includes(option.value))}
          onChange={handleShopChange}
          className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 bg-white shadow-md hover:shadow-lg transition-shadow cursor-pointer font-semibold text-gray-900"
          placeholder="Select Shops"
        />
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={onSaleOnly}
            onChange={(e) => {
              setOnSaleOnly(e.target.checked);
              setPage(0);
              setProducts([]);
            }}
            className="rounded border-gray-300"
          />
          <span className="font-semibold text-gray-900">On Sale Only</span>
        </label>
        <div className="flex items-center space-x-4 flex-shrink-0">
            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search Products..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="block w-60 pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
              />
            </form>
          </div>
      </div>
      <div className="space-y-6">
        {products.map((product) => (
          <div key={product.id} className="max-w-4xl mx-auto w-full">
            <ProductCard product={product} />
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