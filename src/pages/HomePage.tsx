// HomePage.tsx
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import Select, { SingleValue } from 'react-select';
import { MultiValue } from 'react-select';
import { Header } from '../components/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import _ from 'lodash';
import { Range } from 'react-range';

const ITEMS_PER_PAGE = 10;

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopNames, setShopNames] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const observerRef = useRef<HTMLDivElement | null>(null);

  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState<string>(
    new URLSearchParams(location.search).get('search') || ''
  );
  const navigate = useNavigate();

  const [selectedShopName, setSelectedShopName] = useState<string[]>(
    JSON.parse(localStorage.getItem('selectedShopName') || '[]')
  );
  const [inStockOnly, setInStockOnly] = useState<boolean>(
    JSON.parse(localStorage.getItem('inStockOnly') || 'false')
  );
  const [onSaleOnly, setOnSaleOnly] = useState<boolean>(
    JSON.parse(localStorage.getItem('onSaleOnly') || 'false')
  );
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [selectedPriceRange, setSelectedPriceRange] = useState<[number, number]>(
    JSON.parse(localStorage.getItem('selectedPriceRange') || '[0, 1000]').map((value: number) =>
      Math.min(Math.max(value, 0), 1000)
    )
  );

  interface FilterOptions {
    selectedShopName: string[];
    inStockOnly: boolean;
    onSaleOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
  }

  async function fetchFilteredProducts(
    filters: FilterOptions,
    page: number,
    sortOrder: 'asc' | 'desc'
  ) {
    setLoading(true);
    try {
      let query = supabase
        .from('products_with_min_price')
        .select(
          `
          id,
          title,
          shop_id,
          shops ( shop_name ),
          created_at,
          url,
          description,
          updated_at_external,
          min_price,
          variants!inner (
            id,
            available,
            price,
            compare_at_price,
            is_price_lower
          ),
          offers!left (
            id,
            availability,
            price
          )
        `,
          { count: 'exact' }
        );

      // Build filter conditions for shop names.
      const filterConditions: string[] = [];
      if (filters.selectedShopName.length > 0) {
        filterConditions.push(
          `shop_name.in.(${filters.selectedShopName.map((name) => `'${name}'`).join(',')})`
        );
      }

      if (filters.inStockOnly) {
        query = query
          .eq('variants.available', true)
          .eq('offers.availability', 'https://schema.org/InStock');
      }

      if (filters.onSaleOnly) {
        query = query.not('offers.id', 'is', null).eq('variants.is_price_lower', true);
      }

      if (filters.searchQuery) {
        query = query.textSearch('title_search', filters.searchQuery, {
          config: 'english'
        });
      }

      if (filters.selectedPriceRange) {
        query = query
          .gte('variants.price', filters.selectedPriceRange[0])
          .lte('variants.price', filters.selectedPriceRange[1]);
      }

      if (filterConditions.length > 0) {
        query = query.or(filterConditions.join(','));
      }

      // Cursor-based pagination using min_price.
      if (page > 0) {
        const lastProduct = products[products.length - 1];
        if (lastProduct) {
          query = query.lt('min_price', lastProduct.min_price);
        }
      }

      // Order by the min_price field.
      query = query.order('min_price', { ascending: sortOrder === 'asc' });
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query.limit(ITEMS_PER_PAGE);
      if (error) throw error;

      if (data) {
        setProducts((prev) => (page === 0 ? data : [...prev, ...data]));
        setHasMore(data.length === ITEMS_PER_PAGE);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }

  const debouncedFetchProducts = useRef(
    _.debounce(
      (filters: FilterOptions, page: number, sortOrder: 'asc' | 'desc') => {
        fetchFilteredProducts(filters, page, sortOrder);
      },
      300
    )
  ).current;

  useEffect(() => {
    const filters: FilterOptions = {
      selectedShopName,
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange
    };
    debouncedFetchProducts(filters, page, sortOrder);
  }, [
    selectedShopName,
    inStockOnly,
    onSaleOnly,
    searchQuery,
    selectedPriceRange,
    page,
    sortOrder,
    debouncedFetchProducts
  ]);

  useEffect(() => {
    async function fetchShopNames() {
      const { data, error } = await supabase
        .from('distinct_shop_names')
        .select('shop_name')
        .order('shop_name', { ascending: true });
      if (data && !error) {
        setShopNames(data.map((item) => item.shop_name).filter(Boolean));
      }
    }
    fetchShopNames();
  }, []);

  useEffect(() => {
    async function fetchPriceRange() {
      try {
        const { data, error } = await supabase.rpc('get_price_range', {
          shop_names: selectedShopName,
          in_stock: inStockOnly,
          on_sale: onSaleOnly,
          search_query: searchQuery
        });
        if (error) throw error;
        if (data && data.length > 0) {
          const min = 0;
          const max = data[0].max_price || 1000;
          setPriceRange([min, max]);
          setSelectedPriceRange([min, max]);
        }
      } catch (error) {
        console.error('Error fetching price range:', error);
      }
    }
    fetchPriceRange();
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery]);

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
  useEffect(() => {
    localStorage.setItem('selectedPriceRange', JSON.stringify(selectedPriceRange));
  }, [selectedPriceRange]);

  useEffect(() => {
    setPage(0);
    setProducts([]);
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery, selectedPriceRange, sortOrder]);

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

  const sortOptions = [
    { value: 'asc', label: 'Price: Low to High' },
    { value: 'desc', label: 'Price: High to Low' },
  ];

  const handleShopChange = (selectedOptions: MultiValue<{ value: string; label: string }>) => {
    const selectedValues = selectedOptions ? selectedOptions.map((option) => option.value) : [];
    setSelectedShopName(selectedValues);
  };

  const shopOptions = shopNames.map((shopName) => ({
    value: shopName,
    label: shopName
  }));

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/?search=${searchQuery}`);
  };

  const handleSortChange = (
    newValue: SingleValue<{ value: string; label: string }>,
  ) => {
    if (newValue) {
      setSortOrder(newValue.value as 'asc' | 'desc');
    }
  };

  return (
    <>
      <Header
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex flex-wrap gap-8 items-center justify-center">
          <Select
            isMulti
            options={shopOptions}
            value={shopOptions.filter((option) => selectedShopName.includes(option.value))}
            onChange={handleShopChange}
            className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 bg-white shadow-md hover:shadow-lg transition-shadow cursor-pointer font-semibold text-gray-900"
            placeholder={window.innerWidth < 640 ? 'Shops' : 'Select Shops'}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="font-semibold text-gray-900 whitespace-nowrap">In Stock Only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => setOnSaleOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="font-semibold text-gray-900 whitespace-nowrap">On Sale Only</span>
          </label>
          <Select
            options={sortOptions}
            value={sortOptions.find((option) => option.value === sortOrder)}
            onChange={handleSortChange}
            className="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 bg-white shadow-md hover:shadow-lg transition-shadow cursor-pointer font-semibold text-gray-900"
            placeholder="Sort by Price"
          />
        </div>
        <div className="w-64 px-4">
          <p className="font-semibold text-gray-900 mb-2">Price Range</p>
          <Range
            label="Price Range"
            step={1}
            min={priceRange[0]}
            max={priceRange[1]}
            values={selectedPriceRange}
            onChange={(values) => {
              const [minValue, maxValue] = values;
              if (minValue >= priceRange[0] && maxValue <= priceRange[1]) {
                setSelectedPriceRange([minValue, maxValue]);
              }
            }}
            renderTrack={({ props, children }) => (
              <div {...props} className="h-1 bg-gray-200 rounded-full">
                {children}
              </div>
            )}
            renderThumb={({ props }) => (
              <div {...props} key={props.key} style={{ ...props.style }} className="h-4 w-4 bg-blue-600 rounded-full shadow-lg focus:outline-none" />
            )}
          />
          <div className="flex justify-between text-sm text-gray-600 mt-2">
            <span>${selectedPriceRange[0].toFixed(2)}</span>
            <span>${selectedPriceRange[1].toFixed(2)}</span>
          </div>
        </div>
        <div className="space-y-6">
          {loading && (
            <div className="flex justify-center items-center min-h-[200px]">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}
          {!loading && products.length === 0 && (
            <div className="flex justify-center items-center min-h-[200px]">
              <p className="text-gray-900">No products found.</p>
            </div>
          )}
          {products.map((product) => (
            <div key={product.id} className="max-w-4xl mx-auto w-full">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
        <div ref={observerRef} className="flex items-center justify-center py-8"></div>
      </div>
    </>
  );
}
