import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ProductWithDetails } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import Select, { SingleValue } from 'react-select';
import { MultiValue } from 'react-select';
import { Header } from '../components/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import _ from 'lodash';
import { Range } from 'react-range';

const ITEMS_PER_PAGE = 10;

export function HomePage() {
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopNames, setShopNames] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Add a ref to track current request to prevent race conditions
  const currentRequestRef = useRef<AbortController | null>(null);

  interface FilterOptions {
    selectedShopName: string[];
    inStockOnly: boolean;
    onSaleOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
  }

  const fetchFilteredProducts = useCallback(
    async (filters: FilterOptions, page: number, sortOrder: 'asc' | 'desc' | 'discount_desc') => {
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }
      
      currentRequestRef.current = new AbortController();
      
      setLoading(true);
      try {
        let query = supabase
          .from('products_with_details')
          .select('*', { 
            count: 'exact',
            head: false
          })
          .limit(ITEMS_PER_PAGE)
          .abortSignal(currentRequestRef.current.signal);

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
          // Use the full-text search index
          query = query.textSearch('fts', filters.searchQuery, {
            type: 'plain',
            config: 'english'
          });
        }

        if (filters.selectedPriceRange) {
          query = query
            .gte('min_price', filters.selectedPriceRange[0])
            .lte('min_price', filters.selectedPriceRange[1]);
        }

        // Updated sorting logic
        if (sortOrder === 'discount_desc') {
          query = query
            .order('max_discount_percentage', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });
        } else if (sortOrder === 'asc' || sortOrder === 'desc') {
          query = query
            .order('min_price', { ascending: sortOrder === 'asc' })
            .order('created_at', { ascending: false });
        }

        const { data, error, count } = await query
          .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

        if (error) throw error;

        const totalItems = count || 0;
        const loadedItems = page * ITEMS_PER_PAGE + (data?.length || 0);
        const moreAvailable = loadedItems < totalItems;
          
        setProducts(prev => page === 0 ? (data as ProductWithDetails[]) || [] : [...prev, ...(data as ProductWithDetails[] || [])]);
        setHasMore(moreAvailable);
        setInitialLoad(false);
        setError(null);
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error fetching products:', error);
          setError(`Failed to load products: ${error instanceof Error ? error.message : 'Unknown error'}`);
          setProducts([]);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Update shop names fetching to use the materialized view
  useEffect(() => {
    async function fetchShopNames() {
      const { data, error } = await supabase
        .from('products_with_details')
        .select('shop_name')
        .order('shop_name', { ascending: true });
      
      if (data && !error) {
        // Get unique shop names
        const uniqueShopNames = [...new Set(data.map(item => item.shop_name).filter(Boolean))];
        setShopNames(uniqueShopNames);
      }
    }
    fetchShopNames();
  }, []);

  // Create a stable reference for the debounced function
  const debouncedFetchProducts = useRef(
    _.debounce(
      (filters: FilterOptions, page: number, sortOrder: 'asc' | 'desc') => {
        fetchFilteredProducts(filters, page, sortOrder);
      },
      500,
      { leading: false, trailing: true }
    )
  ).current;

  // Main effect for fetching data - simplified dependencies
  useEffect(() => {
    const filters: FilterOptions = {
      selectedShopName,
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange,
    };

    // Reset everything when filters change (except page changes)
    if (page === 0) {
      setProducts([]);
      setInitialLoad(true);
      fetchFilteredProducts(filters, 0, sortOrder);
    } else {
      // This is a pagination request
      debouncedFetchProducts(filters, page, sortOrder);
    }
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery, selectedPriceRange, sortOrder, page, fetchFilteredProducts, debouncedFetchProducts]);

  // Separate effect for fetching shop names (only once)
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

  // Local storage effects
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

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery, selectedPriceRange, sortOrder]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && hasMore && !initialLoad && products.length > 0) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = observerRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [loading, hasMore, initialLoad, products.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }
      debouncedFetchProducts.cancel();
    };
  }, [debouncedFetchProducts]);

  const sortOptions = [
    { value: 'asc', label: 'Price: Low to High' },
    { value: 'desc', label: 'Price: High to Low' },
    { value: 'discount_desc', label: 'Discount: High to Low' },
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
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 mt-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Vertical Filters Sidebar */}
          <div className="lg:w-64 xl:w-72">
            {/* Mobile Filters Toggle */}
            <div className="lg:hidden mb-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center justify-between w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-sm"
              >
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    Filters
                  </span>
                  {selectedShopName.length > 0 || 
                   inStockOnly !== false || 
                   onSaleOnly !== false || 
                   !_.isEqual(selectedPriceRange, PRICE_RANGE) ? (
                    <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full">
                      Active
                    </span>
                  ) : null}
                </div>
                {showFilters ? (
                  <ChevronUp className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
            </div>

            {/* Filters Container */}
            <div className={`${showFilters ? 'block' : 'hidden'} lg:block lg:sticky lg:top-24 lg:self-start`}>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 space-y-6">
                {/* Shop Filter */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Shops {selectedShopName.length > 0 && (
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                        ({selectedShopName.length} selected)
                      </span>
                    )}
                  </h3>
                  <Select
                    isMulti
                    options={shopOptions}
                    value={shopOptions.filter((option) => selectedShopName.includes(option.value))}
                    onChange={handleShopChange}
                    className="basic-multi-select w-full"
                    classNamePrefix="select"
                    placeholder="All shops"
                    isClearable={false}
                    components={{
                      DropdownIndicator: () => null,
                      IndicatorSeparator: () => null,
                    }}
                    styles={{
                      control: (provided) => ({
                        ...provided,
                        minHeight: '38px',
                        borderRadius: '0.375rem',
                        borderColor: '#d1d5db',
                        backgroundColor: 'transparent',
                        '&:hover': {
                          borderColor: '#9ca3af',
                        },
                      }),
                      multiValue: (base) => ({
                        ...base,
                        backgroundColor: '#e5e7eb',
                        borderRadius: '0.375rem',
                      }),
                      multiValueLabel: (base) => ({
                        ...base,
                        color: '#111827',
                        padding: '0.25rem 0.5rem',
                      }),
                      multiValueRemove: (base) => ({
                        ...base,
                        borderRadius: '0 0.375rem 0.375rem 0',
                        color: '#6b7280',
                        ':hover': {
                          backgroundColor: '#d1d5db',
                          color: '#ef4444',
                        },
                      })
                    }}
                  />
                </div>

                {/* Price Range Filter */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Price Range
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="relative w-full">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={selectedPriceRange[0]}
                          onChange={(e) => handlePriceInputChange('min', e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md bg-transparent"
                          min={PRICE_RANGE[0]}
                          max={selectedPriceRange[1]}
                        />
                      </div>
                      <span className="text-gray-500">to</span>
                      <div className="relative w-full">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={selectedPriceRange[1]}
                          onChange={(e) => handlePriceInputChange('max', e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md bg-transparent"
                          min={selectedPriceRange[0]}
                          max={PRICE_RANGE[1]}
                        />
                      </div>
                    </div>
                    <Range
                      step={1}
                      min={PRICE_RANGE[0]}
                      max={PRICE_RANGE[1]}
                      values={selectedPriceRange}
                      onChange={handleSliderChange}
                      renderTrack={({ props, children }) => (
                        <div {...props} className="h-2 bg-gray-200 rounded-full">
                          {children}
                        </div>
                      )}
                      renderThumb={({ props }) => (
                        <div {...props} className="h-4 w-4 bg-blue-600 rounded-full"/>
                      )}
                    />
                  </div>
                </div>
                
                {/* Availability */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Availability</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={inStockOnly}
                        onChange={(e) => setInStockOnly(e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">In Stock Only</span>
                    </label>
                  </div>
                </div>

                {/* Deals */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Deals</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={onSaleOnly}
                        onChange={(e) => setOnSaleOnly(e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">On Sale</span>
                    </label>
                  </div>
                </div>

                {/* Active Filters & Reset */}
                {(selectedShopName.length > 0 || 
                  inStockOnly !== false || 
                  onSaleOnly !== false || 
                  !_.isEqual(selectedPriceRange, PRICE_RANGE)) && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Active filters
                      </h3>
                      
                      <div className="flex flex-wrap gap-2">
                        {selectedShopName.length > 0 && (
                          <>
                            {selectedShopName.map(shop => (
                              <div 
                                key={shop}
                                className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30"
                              >
                                {shop}
                                <button 
                                  onClick={() => setSelectedShopName(prev => prev.filter(s => s !== shop))}
                                  className="ml-1.5 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                        
                        {!_.isEqual(selectedPriceRange, PRICE_RANGE) && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30">
                            ${selectedPriceRange[0]} - ${selectedPriceRange[1]}
                            <button 
                              onClick={() => setSelectedPriceRange([...PRICE_RANGE])}
                              className="ml-1.5 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        
                        {inStockOnly !== false && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30">
                            In Stock Only
                            <button 
                              onClick={() => setInStockOnly(false)}
                              className="ml-1.5 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        
                        {onSaleOnly !== false && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30">
                            On Sale Only
                            <button 
                              onClick={() => setOnSaleOnly(false)}
                              className="ml-1.5 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={() => {
                          setSelectedShopName([]);
                          setInStockOnly(true);
                          setOnSaleOnly(false);
                          setSelectedPriceRange([...PRICE_RANGE]);
                        }}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 w-full text-left"
                      >
                        Clear all filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 will-change-transform">
            {/* Sort Dropdown */}
            <div className="mb-4 flex justify-end">
              <div className="w-48">
                <label className="sr-only">Sort By</label>
                <Select
                  options={sortOptions}
                  value={sortOptions.find((option) => option.value === sortOrder)}
                  onChange={handleSortChange}
                  className="react-select-container w-full"
                  classNamePrefix="react-select"
                  placeholder="Featured"
                  isSearchable={false}
                  styles={{
                    control: (provided) => ({
                      ...provided,
                      minHeight: '38px',
                      borderRadius: '0.375rem',
                      borderColor: '#d1d5db',
                      backgroundColor: 'transparent',
                      color: 'var(--text-color)',
                      '&:hover': {
                        borderColor: '#9ca3af',
                      },
                    }),
                    singleValue: (provided) => ({
                      ...provided,
                      color: 'var(--text-color)',
                    }),
                    input: (provided) => ({
                      ...provided,
                      color: 'var(--text-color)',
                    }),
                    menu: (provided) => ({
                      ...provided,
                      backgroundColor: 'var(--bg-color)',
                      borderColor: '#d1d5db',
                      borderWidth: '1px',
                      borderRadius: '0.375rem',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                      zIndex: 50,
                    }),
                    option: (provided, state) => ({
                      ...provided,
                      backgroundColor: state.isFocused
                        ? state.isSelected 
                          ? '#3b82f6'
                          : '#e2e8f0'
                        : 'transparent',
                      color: state.isFocused
                        ? state.isSelected
                          ? 'white'
                          : 'var(--text-color)'
                        : 'var(--text-color)',
                      ':active': {
                        backgroundColor: state.isSelected ? '#3b82f6' : '#e2e8f0',
                      },
                    }),
                    dropdownIndicator: (provided) => ({
                      ...provided,
                      color: '#64748b',
                      ':hover': {
                        color: '#475569',
                      },
                    }),
                    indicatorSeparator: (provided) => ({
                      ...provided,
                      backgroundColor: '#d1d5db',
                    }),
                  }}
                />
              </div>
            </div>

            {/* Products List */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-6 min-h-[500px]">
              {error ? (
                <div className="col-span-full text-center py-8">
                  <p className="text-red-500 dark:text-red-400 mb-2">{error}</p>
                  <button
                    onClick={() => {
                      setPage(0);
                      setProducts([]);
                      setInitialLoad(true);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : initialLoad ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))
              ) : products.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center min-h-[200px] space-y-2">
                  <p className="text-gray-900 dark:text-gray-100">
                    {searchQuery || selectedShopName.length > 0
                      ? "No products match your filters."
                      : "No products available at the moment."}
                  </p>
                  <button
                    onClick={() => {
                      setPage(0);
                      setProducts([]);
                      setInitialLoad(true);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {products
                    .filter((product, index, self) => 
                      index === self.findIndex(p => p.id === product.id)
                    )
                    .map((product) => (
                    <div key={`${product.id}-${product.shop_id}`} className="h-full">
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
    </div>
  );
}