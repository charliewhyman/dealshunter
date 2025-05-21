import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Product } from '../types';
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
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopNames, setShopNames] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [showFilters, setShowFilters] = useState(false);

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

  const [databaseStatus, setDatabaseStatus] = useState<{
    viewEmpty: boolean;
    fallbackActive: boolean;
    error: string | null;
  }>({ viewEmpty: false, fallbackActive: false, error: null });

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
        // First try the products_with_min_price view
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
          // Try both methods - simple ILIKE first
          try {
            query = query.ilike('title', `%${filters.searchQuery}%`);
          } catch (e) {
            console.warn('Simple search failed, trying FTS:', e);
            query = query.textSearch('fts', filters.searchQuery, {
              config: 'english',
              type: 'websearch',
            });
          }
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
  
        // If view is empty but no error, try fallback to products table
        if ((!data || data.length === 0) && !error && !databaseStatus.fallbackActive) {
          console.warn('products_with_min_price view empty, trying fallback query');
          setDatabaseStatus(prev => ({ ...prev, viewEmpty: true, fallbackActive: true }));
          return;
        }
  
        if (error) throw error;
  
        const formattedData = (data || []).map((item) => ({
          ...item,
          variants: [],
          offers: [],
        })) as Product[];
  
        setProducts(prev => {
          if (page === 0) return formattedData;
          return [...prev, ...formattedData];
        });
        setHasMore(formattedData.length === ITEMS_PER_PAGE);
        setInitialLoad(false);
        setDatabaseStatus(prev => ({ ...prev, error: null }));
      } catch (error) {
        console.error('Error fetching products:', error);
        setDatabaseStatus(prev => ({
          ...prev,
          error: `Failed to load products: ${error instanceof Error ? error.message : 'Unknown error'}`
        }));
        setProducts([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [databaseStatus.fallbackActive]
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

  useEffect(() => {
    if (databaseStatus.viewEmpty && !databaseStatus.fallbackActive) {
      const fetchFallbackProducts = async () => {
        try {
          console.log('Attempting fallback to products table');
          const query = supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(ITEMS_PER_PAGE);
  
          const { data, error } = await query;
  
          if (error) throw error;
  
          const formattedData = (data || []).map((product) => ({
            ...product,
            min_price: product.price || 0, // Add fallback min_price
            in_stock: true, // Assume in stock for fallback
            on_sale: false, // Assume not on sale for fallback
            variants: [],
            offers: [],
          })) as Product[];
  
          setProducts(formattedData);
          setHasMore(formattedData.length === ITEMS_PER_PAGE);
          setDatabaseStatus(prev => ({ ...prev, fallbackActive: true }));
        } catch (error) {
          console.error('Fallback query failed:', error);
          setDatabaseStatus(prev => ({
            ...prev,
            error: `Fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }));
        }
      };
  
      fetchFallbackProducts();
    }
  }, [databaseStatus.viewEmpty, databaseStatus.fallbackActive]);

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
        {/* Filters Section - Improved Layout */}
        <div className="mb-8">
          {/* Mobile Filters Toggle - Improved */}
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
                 inStockOnly !== true || 
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

          {/* Filters Container - Improved Layout */}
          <div className="flex flex-wrap items-end gap-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
  {/* Shop Filter */}
  <div className="min-w-[200px] flex-1">
    <div className="flex flex-col h-full">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Shops {selectedShopName.length > 0 && (
          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
            ({selectedShopName.length} selected)
          </span>
        )}
      </label>
      <div className="flex-1 flex items-end">
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
    </div>
  </div>

  {/* Price Range Filter */}
  <div className="min-w-[300px] flex-1">
    <div className="flex flex-col h-full">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-">
        Price Range
      </label>
      <div className="flex items-center gap-5 h-[38px]">
        <div className="relative w-24">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
          <input
            type="number"
            value={selectedPriceRange[0]}
            onChange={(e) => handlePriceInputChange('min', e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-m bg-transparent"
            min={PRICE_RANGE[0]}
            max={selectedPriceRange[1]}
          />
        </div>
        
        <div className="flex-1">
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

        <div className="relative w-24">
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
    </div>
  </div>
  
  {/* Sort Dropdown */}
  <div className="min-w-[180px] flex-1">
    <div className="flex flex-col h-full">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Sort By
      </label>
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
            '&:hover': {
              borderColor: '#9ca3af',
            },
          }),
          singleValue: (base) => ({
            ...base,
            color: 'inherit',
          }),
          menu: (base) => ({
            ...base,
            backgroundColor: 'hsl(var(--background))',
            borderColor: 'hsl(var(--border))',
          }),
          option: (base, state) => ({
            ...base,
            backgroundColor: state.isFocused
              ? 'hsl(var(--accent))'
              : 'transparent',
            color: state.isFocused
              ? 'hsl(var(--accent-foreground))'
              : 'inherit',
          }),
        }}
      />
    </div>
  </div>

  {/* Checkboxes */}
  <div className="flex items-center gap-4 h-[38px]">
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={inStockOnly}
        onChange={(e) => setInStockOnly(e.target.checked)}
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">In Stock</span>
    </label>
    <label className="inline-flex items-center space-x-2">
      <input
        type="checkbox"
        checked={onSaleOnly}
        onChange={(e) => setOnSaleOnly(e.target.checked)}
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">On Sale</span>
    </label>
</div>

            {/* Active Filters & Reset - Improved Standard UI */}
            {(selectedShopName.length > 0 || 
              inStockOnly !== true || 
              onSaleOnly !== false || 
              !_.isEqual(selectedPriceRange, PRICE_RANGE)) && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Active filters:
                    </span>
                    
                    {selectedShopName.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
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
                      </div>
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
                    
                    {inStockOnly !== true && (
                      <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30">
                        Include Out of Stock
                        <button 
                          onClick={() => setInStockOnly(true)}
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
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 whitespace-nowrap"
                  >
                    Clear all filters
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Products List */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
          {databaseStatus.error ? (
            <div className="col-span-full text-center py-8">
              <p className="text-red-500 dark:text-red-400 mb-2">{databaseStatus.error}</p>
              <p className="text-gray-600 dark:text-gray-400">
                {databaseStatus.viewEmpty && "The products view appears to be empty."}
              </p>
            </div>
          ) : initialLoad ? (
            Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))
          ) : products.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center min-h-[200px] space-y-2">
              <p className="text-gray-900 dark:text-gray-100">No products found.</p>
              <button
                onClick={() => {
                  setPage(0);
                  setProducts([]);
                  setInitialLoad(true);
                  setDatabaseStatus({ viewEmpty: false, fallbackActive: false, error: null });
                }}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                Retry
              </button>
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
  );
}