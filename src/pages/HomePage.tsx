import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
  const [initialLoad, setInitialLoad] = useState(true);
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
    JSON.parse(localStorage.getItem('inStockOnly') || 'true')
  );
  const [onSaleOnly, setOnSaleOnly] = useState<boolean>(
    JSON.parse(localStorage.getItem('onSaleOnly') || 'false')
  );

  const PRICE_RANGE: [number, number] = [15, 1000];
  const [selectedPriceRange, setSelectedPriceRange] = useState<[number, number]>(() => {
    const savedRange = JSON.parse(localStorage.getItem('selectedPriceRange') || 'null');
    return savedRange && savedRange[0] >= PRICE_RANGE[0] && savedRange[1] <= PRICE_RANGE[1] 
      ? savedRange 
      : [...PRICE_RANGE];
  });

  interface FilterOptions {
    selectedShopName: string[];
    inStockOnly: boolean;
    onSaleOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
  }

  const fetchFilteredProducts = useCallback(
    async (filters: FilterOptions, page: number, sortOrder: 'asc' | 'desc') => {
      setLoading(true);
      try {
        let query = supabase
          .from('products_with_min_price')
          .select(
            'id, title, shop_id, shop_name, created_at, url, description, updated_at_external, min_price, in_stock, on_sale',
            { count: 'exact' }
          );        
    
        // Apply filters
        if (filters.selectedShopName.length > 0) {
          query = query.in('shop_name', filters.selectedShopName);
        }
    
        if (filters.inStockOnly) {
          query = query.eq('in_stock', true);
        }
    
        if (filters.onSaleOnly) {
          query = query.eq('on_sale', true);
        }
    
        if (filters.searchQuery) {
          query = query.textSearch('fts', filters.searchQuery, {
            config: 'english',
            type: 'websearch', 
          });
        }
    
        if (filters.selectedPriceRange) {
          query = query
            .gte('min_price', filters.selectedPriceRange[0])
            .lte('min_price', filters.selectedPriceRange[1]);
        }
    
        // Apply sorting and pagination
        query = query
          .order('min_price', { ascending: sortOrder === 'asc' })
          .order('created_at', { ascending: false })
          .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
    
        const { data, error } = await query;
    
        if (error) {
          throw new Error(`Supabase query error: ${error.message}`);
        }
    
        const formattedData = data?.map((item) => ({
          ...item,
          variants: [],
          offers: [],
        })) as Product[] || [];
    
        setProducts(prev => {
          if (page === 0) return formattedData;
          
          const newItems = formattedData.filter(
            newItem => !prev.some(existingItem => existingItem.id === newItem.id)
          );
          
          return [...prev, ...newItems];
        });
        setHasMore(formattedData.length === ITEMS_PER_PAGE);
        setInitialLoad(false);
      } catch (error) {
        console.error('Error fetching products:', error);
        setProducts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    []
  );

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
      selectedPriceRange,
    };
    
    if (page === 0 && products.length === 0) {
      fetchFilteredProducts(filters, page, sortOrder);
    } else {
      debouncedFetchProducts(filters, page, sortOrder);
    }
  }, [
    selectedShopName, 
    inStockOnly, 
    onSaleOnly, 
    searchQuery, 
    selectedPriceRange, 
    page, 
    sortOrder, 
    debouncedFetchProducts, 
    products.length,
    fetchFilteredProducts
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
    setInitialLoad(true);
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery, selectedPriceRange, sortOrder]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !initialLoad) {
          setPage(prev => prev + 1);
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
  }, [hasMore, loading, initialLoad]);

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
    label: shopName,
  }));

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/?search=${searchQuery}`);
  };

  const handleSortChange = (
    newValue: SingleValue<{ value: string; label: string }>
  ) => {
    if (newValue) {
      setSortOrder(newValue.value as 'asc' | 'desc');
    }
  };

  const handleSliderChange = (values: number[]) => {
    const [minValue, maxValue] = values;
    setSelectedPriceRange([minValue, maxValue]);
  };

  const handlePriceInputChange = (type: 'min' | 'max', value: string) => {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return;
  
    if (type === 'min') {
      const newMin = Math.min(
        Math.max(numericValue, PRICE_RANGE[0]),
        selectedPriceRange[1]
      );
      setSelectedPriceRange([newMin, selectedPriceRange[1]]);
    } else {
      const newMax = Math.max(
        Math.min(numericValue, PRICE_RANGE[1]),
        selectedPriceRange[0]
      );
      setSelectedPriceRange([selectedPriceRange[0], newMax]);
    }
  };

  function ProductCardSkeleton() {
    return (
      <div className="max-w-4xl mx-auto w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full mb-1"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6 mb-1"></div>
        <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-2/3"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Header
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters Container */}
        <div className="mb-6">
          {/* First Row - Main Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start sticky top-0 bg-white dark:bg-gray-900 pt-4 pb-4 z-10">
            {/* Shop Filter */}
            <div className="space-y-2 h-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Shops</label>
              <Select
                isMulti
                options={shopOptions}
                value={shopOptions.filter((option) => selectedShopName.includes(option.value))}
                onChange={handleShopChange}
                className="basic-multi-select"
                classNamePrefix="select"
                placeholder="Select shops..."
                styles={{
                  control: (base, state) => ({
                    ...base,
                    borderRadius: '0.375rem',
                    borderColor: state.isFocused ? '#3b82f6' : '#d1d5db',
                    minHeight: '42px',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-color)',
                    boxShadow: state.isFocused ? '0 0 0 1px #3b82f6' : 'none',
                    '&:hover': {
                      borderColor: '#3b82f6',
                    },
                  }),
                menu: (base) => ({
                  ...base,
                  backgroundColor: 'var(--bg-color)',
                  color: 'var(--text-color)',
                }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isFocused ? '#3b82f6' : 'transparent',
                  color: state.isFocused ? '#fff' : 'var(--text-color)',
                }),
                multiValue: (base) => ({
                  ...base,
                  backgroundColor: '#e2e8f0',
                }),
                multiValueLabel: (base) => ({
                  ...base,
                  color: '#1e293b',
                }),
              }}
              theme={(theme) => ({
                ...theme,
                colors: {
                  ...theme.colors,
                  primary: '#3b82f6',
                  neutral80: 'var(--text-color)',
                },
              })}
            />
          </div>
          <div className="space-y-2 h-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Price Range ($)</label>
              <div className="flex flex-col space-y-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={selectedPriceRange[0]}
                    onChange={(e) => handlePriceInputChange('min', e.target.value)}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    min={0}
                  />
                  <input
                    type="number"
                    value={selectedPriceRange[1]}
                    onChange={(e) => handlePriceInputChange('max', e.target.value)}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    min={selectedPriceRange[0]}
                  />
                </div>
                <Range
                  step={1}
                  min={PRICE_RANGE[0]}
                  max={PRICE_RANGE[1]}
                  values={[
                    Math.max(selectedPriceRange[0], PRICE_RANGE[0]),
                    Math.min(selectedPriceRange[1], PRICE_RANGE[1])
                  ]}
                  onChange={handleSliderChange}
                  renderTrack={({ props, children }) => (
                    <div
                      {...props}
                      className="h-1.5 w-full bg-gray-200 dark:bg-gray-600 rounded-full"
                    >
                      {children}
                    </div>
                  )}
                  renderThumb={({ props }) => {
                    const { key, ...restProps } = props;
                    return (
                      <div
                        key={key}
                        {...restProps}
                        className="h-4 w-4 bg-blue-600 dark:bg-blue-500 rounded-full shadow-lg focus:outline-none ring-2 ring-white dark:ring-gray-800"
                      />
                    );
                  }}
                />
              </div>
            </div>
            
            {/* Sort Dropdown */}
            <div className="space-y-2 h-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Sort By</label>
              <Select
                options={sortOptions}
                value={sortOptions.find((option) => option.value === sortOrder)}
                onChange={handleSortChange}
                className="basic-single"
                classNamePrefix="select"
                placeholder="Select sort..."
                styles={{
                  control: (base, state) => ({
                    ...base,
                    borderRadius: '0.375rem',
                    borderColor: state.isFocused ? '#3b82f6' : '#d1d5db',
                    minHeight: '42px',
                    backgroundColor: 'var(--bg-color)',
                    color: 'var(--text-color)',
                    boxShadow: state.isFocused ? '0 0 0 1px #3b82f6' : 'none',
                    '&:hover': {
                      borderColor: '#3b82f6',
                    },
                  }),
                menu: (base) => ({
                  ...base,
                  backgroundColor: 'var(--bg-color)',
                  color: 'var(--text-color)',
                }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isFocused ? '#3b82f6' : 'transparent',
                  color: state.isFocused ? '#fff' : 'var(--text-color)',
                }),
              }}
              theme={(theme) => ({
                ...theme,
                colors: {
                  ...theme.colors,
                  primary: '#3b82f6',
                  neutral80: 'var(--text-color)',
                },
              })}
            />
                        <div></div>
                    </div>
            {/* Second Row - Checkboxes and Reset Button */}
          <div className="flex justify-between items-center mt-4">
            {/* Checkboxes */}
            <div className="flex items-center space-x-6">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">In Stock Only</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={onSaleOnly}
                  onChange={(e) => setOnSaleOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-800"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">On Sale Only</span>
              </label>
            </div>

            {/* Reset Filters Button */}
            <button 
              onClick={() => {
                setSelectedShopName([]);
                setInStockOnly(true);
                setOnSaleOnly(false);
                setSelectedPriceRange([...PRICE_RANGE]);
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Products List */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
          {initialLoad ? (
            Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))
          ) : products.length === 0 ? (
            <div className="col-span-full flex justify-center items-center min-h-[200px]">
              <p className="text-gray-900 dark:text-gray-100">No products found.</p>
            </div>
          ) : (
            <>
              {products.map((product) => (
                <div key={product.id} className="h-full">
                  <ProductCard product={product} />
                </div>
              ))}
              {loading && page > 0 && (
                <div className="col-span-full flex justify-center items-center py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-500" />
                </div>
              )}
            </>
          )}
        </div>
        <div ref={observerRef} className="h-1" />
      </div>
    </div>
    </div>
  );
}