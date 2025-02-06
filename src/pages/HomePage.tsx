import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import Select from 'react-select';
import { MultiValue } from 'react-select';
import { Header } from '../components/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import _ from 'lodash';

const ITEMS_PER_PAGE = 10;

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [shopNames, setShopNames] = useState<string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize filters from localStorage
  const [selectedShopName, setSelectedShopName] = useState<string[]>(
    JSON.parse(localStorage.getItem('selectedShopName') || '[]')
  );
  const [inStockOnly, setInStockOnly] = useState<boolean>(
    JSON.parse(localStorage.getItem('inStockOnly') || 'false')
  );
  const [onSaleOnly, setOnSaleOnly] = useState<boolean>(
    JSON.parse(localStorage.getItem('onSaleOnly') || 'false')
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    new URLSearchParams(location.search).get('search') || ''
  );

  // Debounce function to delay filter requests
  interface FilterOptions {
    selectedShopName: string[];
    inStockOnly: boolean;
    onSaleOnly: boolean;
    searchQuery: string;
  }

  async function fetchFilteredProducts(filters: FilterOptions) {
    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select(`
          *,
          variants:variants!inner(*),
          offers (*)
        `);

      if (filters.selectedShopName.length > 0) {
        const shopNameConditions = filters.selectedShopName.map(name => `shop_name.ilike.%${name}%`).join(',');
        query = query.or(shopNameConditions);
      }

      if (filters.inStockOnly) {
        query = query
          .eq('variants.available', true)
          .eq('offers.availability', 'https://schema.org/InStock');
      }

      if (filters.onSaleOnly) {
        query = query
          .not('offers.id', 'is', null)
          .eq('variants.is_price_lower', true);
      }

      if (filters.searchQuery) {
        query = query.textSearch('title', filters.searchQuery);
      }

      const { data, error } = await query.range(0, ITEMS_PER_PAGE - 1);

      if (error) throw error;

      if (data) {
        setProducts(data);
        setHasMore(data.length > 0);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }

  const debouncedFetchProducts = useRef(
    _.debounce((filters: FilterOptions) => {
      fetchFilteredProducts(filters);
    }, 300)
  ).current;

  useEffect(() => {
    const filters = {
      selectedShopName,
      inStockOnly,
      onSaleOnly,
      searchQuery,
    };
    debouncedFetchProducts(filters);
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery, debouncedFetchProducts]);

  // Fetch unique shop names on mount
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

  // Fetch products when filters or page changes
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

  // Save filters to localStorage when they change
  useEffect(() => {
    localStorage.setItem('selectedShopName', JSON.stringify(selectedShopName));
  }, [selectedShopName]);

  useEffect(() => {
    localStorage.setItem('inStockOnly', JSON.stringify(inStockOnly));
  }, [inStockOnly]);

  useEffect(() => {
    localStorage.setItem('onSaleOnly', JSON.stringify(onSaleOnly));
  }, [onSaleOnly]);

  useEffect(() => {
    localStorage.setItem('searchQuery', searchQuery);
  }, [searchQuery]);

  // Reset pagination and clear products when filters change
  useEffect(() => {
    setPage(0);
    setProducts([]);
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setLoading(true);
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

  useEffect(() => {
    setLoading(false);
  }, [products]);

  // Handle shop selection
  const handleShopChange = (selectedOptions: MultiValue<{ value: string; label: string }>) => {
    const selectedValues = selectedOptions ? selectedOptions.map((option) => option.value) : [];
    setSelectedShopName(selectedValues);
  };

  const shopOptions = shopNames.map((shopName) => ({
    value: shopName,
    label: shopName,
  }));

  // Handle search input changes
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/?search=${searchQuery}`);
  };

  return (
    <>
      <Header
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
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
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="font-semibold text-gray-900">In Stock Only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => setOnSaleOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="font-semibold text-gray-900">On Sale Only</span>
          </label>
        </div>
        <div className="space-y-6">
              {loading && (
                <div className="flex justify-center items-center min-h-[200px]">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              )}
          {products.map((product) => (
            <div key={product.id} className="max-w-4xl mx-auto w-full">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
        <div ref={observerRef} className="flex items-center justify-center py-8">
        </div>
      </div>
    </>
  );
}