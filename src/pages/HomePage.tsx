import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ProductWithDetails } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { SingleValue } from 'react-select';
import { Header } from '../components/Header';
import { useLocation, useNavigate } from 'react-router-dom';
import { debounce, isEqual } from 'lodash-es';
import { Range } from 'react-range';
import { MultiSelectDropdown, SingleSelectDropdown } from '../components/Dropdowns';

const ITEMS_PER_PAGE = 10;

export function HomePage() {
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopNames, setShopNames] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState<string>(
    new URLSearchParams(location.search).get('search') || ''
  );
  const navigate = useNavigate();

  const [selectedShopName, setSelectedShopName] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedShopName');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedCategories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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

  const [selectedSizeGroups, setSelectedSizeGroups] = useState<string[]>(
    JSON.parse(localStorage.getItem('selectedSizeGroups') || '[]')
  );

  const [activeCategory, setActiveCategory] = useState('all');
  const [allSizeData, setAllSizeData] = useState<{size_group: string, type: string}[]>([]);

  // Add a ref to track current request to prevent race conditions
  const currentRequestRef = useRef<AbortController | null>(null);
  


  interface FilterOptions {
    selectedShopName: string[];
    selectedSizeGroups: string[];
    selectedCategories: string[];
    inStockOnly: boolean;
    onSaleOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
  }

  const fetchFilteredProducts = useCallback(
  async (
    filters: FilterOptions,
    page: number,
    sortOrder: 'asc' | 'desc' | 'discount_desc',
    attempt = 1
  ) => {
    // Abort previous request if it exists
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
    }

    const controller = new AbortController();
    currentRequestRef.current = controller;

    setLoading(true);
    
    try {
      // Small delay to prevent rapid successive requests
      await new Promise(resolve => setTimeout(resolve, 100));

      let query = supabase
        .from('products_with_details')
        .select('*', { 
          count: 'exact',
          head: false
        })
        .limit(ITEMS_PER_PAGE)
        .abortSignal(controller.signal);

      // Apply filters
      if (filters.selectedShopName.length > 0) {
        query = query.in('shop_name', filters.selectedShopName);
      }

      if (filters.selectedCategories.length > 0) {
        query = query.overlaps('categories', filters.selectedCategories);
      }

      if (filters.inStockOnly) {
        query = query.eq('in_stock', true);
      }

      if (filters.onSaleOnly) {
        query = query.eq('on_sale', true);
      }

      if (filters.searchQuery) {
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

      if (filters.selectedSizeGroups.length > 0) {
        query = query.overlaps('size_groups', filters.selectedSizeGroups);
      }

      // Apply sorting
      if (sortOrder === 'discount_desc') {
        query = query
          .order('max_discount_percentage', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });
      } else {
        query = query
          .order('min_price', { ascending: sortOrder === 'asc' })
          .order('created_at', { ascending: false });
      }

      const { data, error, count } = await query
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      // Handle Supabase errors
      if (error) {
        // Special handling for JWT/authentication errors
        if (error.message.includes('JWT') || error.code === 'PGRST301') {
          console.error('Auth error, attempting to refresh session');
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) throw refreshError;
          if (attempt < 3) {
            return fetchFilteredProducts(filters, page, sortOrder, attempt + 1);
          }
        }
        throw error;
      }

      const totalItems = count || 0;
      const loadedItems = page * ITEMS_PER_PAGE + (data?.length || 0);
      const moreAvailable = loadedItems < totalItems;
        
      setProducts(prev => 
        page === 0 
          ? (data as ProductWithDetails[]) || [] 
          : [...prev, ...(data as ProductWithDetails[] || [])]
      );
      setHasMore(moreAvailable);
      setInitialLoad(false);
      setError(null);

    } catch (error: unknown) {
      // Only handle error if it wasn't an abort
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Fetch error:', error);
        
        // Retry for network errors or server issues
        if (
          (error instanceof TypeError ||
            (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ETIMEDOUT') ||
            (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ECONNABORTED')
          ) && attempt < 3
        ) {
          console.log(`Retrying... attempt ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          return fetchFilteredProducts(filters, page, sortOrder, attempt + 1);
        }

        setError(
          `Failed to load products: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        setProducts([]);
        setHasMore(false);
      }
    } finally {
      // Only stop loading if this wasn't aborted for a new request
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  },
  []
);

  // Update shop names fetching to use the materialized view
  useEffect(() => {
    async function fetchInitialData() {
      // Fetch shop names
      const { data: shopData, error: shopError } = await supabase
        .from('distinct_shop_names')
        .select('shop_name')
        .order('shop_name', { ascending: true });
      
      if (shopData && !shopError) {
        setShopNames(shopData.map(item => item.shop_name).filter(Boolean));
      }

      // Fetch product categories
      const { data: categoryData, error: categoryError } = await supabase
        .from('products_with_details')
        .select('categories')
        .not('categories', 'is', null);

      if (categoryData && !categoryError) {
        const uniqueCategories = Array.from(new Set(
          categoryData.flatMap(item => item.categories).filter(Boolean)
        )).sort();
        setCategories(uniqueCategories);
      }
  
      // Fetch size data
      const { data: sizeData, error: sizeError } = await supabase
        .from('distinct_size_groups_and_types')
        .select('size_group, type');
      
      if (sizeData && !sizeError) {
        setAllSizeData(sizeData);
      }
    }
    
    fetchInitialData();
  }, []);

  // Create a stable reference for the debounced function
  const debouncedFetchProducts = useRef(
    debounce(
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
      selectedSizeGroups,
      selectedCategories,
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange,
    };

    // Reset everything when filters change (except page changes)
    if (page === 0) {
      setProducts([]);
      setInitialLoad(true);
      fetchFilteredProducts(filters, 0, sortOrder).catch(err => {
        console.error('Error:', err);
      });
  } else {
      fetchFilteredProducts(filters, page, sortOrder).catch(err => {
        console.error('Error:', err);
      });
    }
  }, [selectedShopName, inStockOnly, onSaleOnly, searchQuery, selectedPriceRange, sortOrder, page, selectedSizeGroups, fetchFilteredProducts, selectedCategories]);

  // Local storage effects
  useEffect(() => {
    localStorage.setItem('selectedShopName', JSON.stringify(selectedShopName));
  }, [selectedShopName]);
  
  useEffect(() => {
    localStorage.setItem('selectedCategories', JSON.stringify(selectedCategories));
  }, [selectedCategories]);
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
    localStorage.setItem('selectedSizeGroups', JSON.stringify(selectedSizeGroups));
  }, [selectedSizeGroups]);

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

  // Handle size groups
  
  const getAvailableCategories = () => {
    const uniqueTypes = Array.from(new Set(allSizeData.map(item => item.type)));
    return uniqueTypes.filter(type => type !== null && type !== undefined);
  };
  
  const getCurrentSizeOptions = (category: string) => {
    // Filter size groups based on active category
    const filteredSizes = category === 'all' 
      ? allSizeData 
      : allSizeData.filter(item => item.type === category);
    
    // Get unique size groups from the filtered data
    const uniqueSizeGroups = Array.from(
      new Set(filteredSizes.map(item => item.size_group))
    ).filter(Boolean);
    
    return uniqueSizeGroups.map(size => ({
      value: size,
      label: size
    }));
  };

  const SizeGroupsFilter = () => {
    const availableCategories = getAvailableCategories();
    const showCategoryTabs = availableCategories.length > 1;
  
    return (
      <div>
        <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
          Sizes {selectedSizeGroups.length > 0 && (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
              ({selectedSizeGroups.length} selected)
            </span>
          )}
        </h3>
        
        {/* Category Tabs - only show if we have multiple categories */}
        {showCategoryTabs && (
          <div className="flex flex-wrap gap-1.5 mb-3 border-b border-gray-200 dark:border-gray-600 pb-3">
          {/* Define the exact order we want */}
          {[
            'all',
            'Clothing',
            'Footwear',
            'Bras',
            'Children\'s',
            'Other'
          ].filter(category => 
            // Only show categories that exist in our data
            category === 'all' || availableCategories.includes(category)
          ).map(category => (
            <button 
              key={category}
              className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                activeCategory === category 
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-100 font-medium shadow-inner' 
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
              onClick={() => setActiveCategory(category === 'all' ? 'all' : category)}
            >
              {category === 'all' ? 'All Sizes' : category}
            </button>
          ))}
        </div>
        )}
        
        <MultiSelectDropdown
          options={getCurrentSizeOptions(activeCategory)}
          selected={selectedSizeGroups}
          onChange={setSelectedSizeGroups}
          placeholder="All sizes"
        />
      </div>
    );
  };

  const handleClearAllFilters = () => {
    setSelectedShopName([]);
    setSelectedCategories([]);
    setInStockOnly(true);
    setOnSaleOnly(false);
    setSelectedSizeGroups([]);
    setSelectedPriceRange([...PRICE_RANGE]);
    setActiveCategory('all');
  }

  function ProductCardSkeleton() {
    return (
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-3 animate-pulse sm:p-4">
        <div className="h-5 sm:h-6 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mb-3 sm:mb-4"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-full mb-1"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6 mb-1"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-2/3"></div>
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
      
      <div className="mx-auto px-4 py-4 mt-4 sm:px-6 sm:py-6 lg:px-8 max-w-7xl">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* Vertical Filters Sidebar - Mobile Toggle */}
          <div className="lg:w-64 xl:w-72">
            <div className="lg:hidden mb-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center justify-between w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-sm sm:px-4 sm:py-3"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:text-base">
                    Filters
                  </span>
                  {
                    selectedShopName.length > 0 || 
                    selectedCategories.length > 0 ||
                    inStockOnly !== false || 
                    onSaleOnly !== false || 
                    !isEqual(selectedPriceRange, PRICE_RANGE) ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-blue-600 rounded-full sm:px-2 sm:py-1">
                        Active
                      </span>
                  ) : null}
                </div>
                {showFilters ? (
                  <ChevronUp className="h-4 w-4 text-gray-600 dark:text-gray-400 sm:h-5 sm:w-5" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-600 dark:text-gray-400 sm:h-5 sm:w-5" />
                )}
              </button>
            </div>
  
            {/* Filters Container */}
            <div className={`${showFilters ? 'block' : 'hidden'} lg:block lg:sticky lg:top-24 lg:self-start`}>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 space-y-4 sm:p-4 sm:space-y-6">
                {/* Shop Filter */}
                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Shops {selectedShopName.length > 0 && (
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                        ({selectedShopName.length} selected)
                      </span>
                    )}
                  </h3>
                  <MultiSelectDropdown
                    options={shopOptions}
                    selected={selectedShopName}
                    onChange={setSelectedShopName}
                    placeholder="All shops"
                  />
                </div>

                {/* Category Filter */}
                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Categories {selectedCategories.length > 0 && (
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                        ({selectedCategories.length} selected)
                      </span>
                    )}
                  </h3>
                  <MultiSelectDropdown
                    options={categories.map(cat => ({
                      value: cat,
                      label: cat
                    }))}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                    placeholder="All categories"
                  />
                </div>
  
                {/* Price Range Filter */}
                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Price Range
                  </h3>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="relative w-full">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm sm:text-base">$</span>
                        <input
                          type="number"
                          value={selectedPriceRange[0]}
                          onChange={(e) => handlePriceInputChange('min', e.target.value)}
                          className="w-full pl-6 pr-2 py-1 border border-gray-300 rounded-md bg-transparent text-sm sm:pl-8 sm:pr-3 sm:py-1.5 sm:text-base"
                          min={PRICE_RANGE[0]}
                          max={selectedPriceRange[1]}
                        />
                      </div>
                      <span className="text-gray-500 text-sm sm:text-base">to</span>
                      <div className="relative w-full">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm sm:text-base">$</span>
                        <input
                          type="number"
                          value={selectedPriceRange[1]}
                          onChange={(e) => handlePriceInputChange('max', e.target.value)}
                          className="w-full pl-6 pr-2 py-1 border border-gray-300 rounded-md bg-transparent text-sm sm:pl-8 sm:pr-3 sm:py-1.5 sm:text-base"
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
                        <div {...props} className="h-1.5 sm:h-2 bg-gray-200 rounded-full">
                          {children}
                        </div>
                      )}
                      renderThumb={({ props }) => (
                        <div {...props} className="h-3 w-3 sm:h-4 sm:w-4 bg-blue-600 rounded-full"/>
                      )}
                    />
                  </div>
                </div>

                {/* Size Groups Filter */}
                <SizeGroupsFilter />
                
                {/* Combined Filters Section */}
                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">Filters</h3>
                  <div className="flex gap-4 sm:gap-6">
                    {/* Availability */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={inStockOnly}
                          onChange={(e) => setInStockOnly(e.target.checked)}
                          className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600 sm:h-4 sm:w-4"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300 sm:text-sm">In Stock</span>
                      </label>
                    </div>

                    {/* Deals */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={onSaleOnly}
                          onChange={(e) => setOnSaleOnly(e.target.checked)}
                          className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:checked:bg-blue-600 sm:h-4 sm:w-4"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300 sm:text-sm">On Sale</span>
                      </label>
                    </div>
                  </div>
                </div>
  
                {/* Active Filters & Reset */}
                {(selectedShopName.length > 0 || 
                  inStockOnly !== false || 
                  onSaleOnly !== false || 
                  !isEqual(selectedPriceRange, PRICE_RANGE)) && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700 sm:pt-4">
                    <div className="space-y-2 sm:space-y-3">
                      <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">
                        Active filters
                      </h3>
                      
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedShopName.length > 0 && (
                          <>
                            {selectedShopName.map(shop => (
                              <div 
                                key={shop}
                                className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1"
                              >
                                {shop}
                                <button 
                                  onClick={() => setSelectedShopName(prev => prev.filter(s => s !== shop))}
                                  className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}

                        {selectedCategories.length > 0 && (
                          <>
                            {selectedCategories.map(cat => (
                              <div 
                                key={cat}
                                className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1"
                              >
                                {cat}
                                <button 
                                  onClick={() => setSelectedCategories(prev => prev.filter(c => c !== cat))}
                                  className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                        
                        {!isEqual(selectedPriceRange, PRICE_RANGE) && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1">
                            ${selectedPriceRange[0]} - ${selectedPriceRange[1]}
                            <button 
                              onClick={() => setSelectedPriceRange([...PRICE_RANGE])}
                              className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        )}

                        {selectedSizeGroups.length > 0 && (
                          <>
                            {selectedSizeGroups.map(size => (
                              <div 
                                key={size}
                                className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1"
                              >
                                {size}
                                <button 
                                  onClick={() => setSelectedSizeGroups(prev => prev.filter(s => s !== size))}
                                  className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                        
                        {inStockOnly !== false && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1">
                            In Stock
                            <button 
                              onClick={() => setInStockOnly(false)}
                              className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        )}
                        
                        {onSaleOnly !== false && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1">
                            On Sale
                            <button 
                              onClick={() => setOnSaleOnly(false)}
                              className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick= {handleClearAllFilters}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 w-full text-left sm:text-sm"
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
            <div className="mb-3 flex justify-end sm:mb-4">
              <div className="w-40 sm:w-48">
                <label className="sr-only">Sort By</label>
                <SingleSelectDropdown
                  options={sortOptions}
                  selected={sortOrder}
                  onChange={(value) => handleSortChange({
                    value,
                    label: ''
                  })}
                  placeholder="Featured"
                />
              </div>
            </div>

  
            {/* Products List */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 min-h-[400px] sm:grid-cols-3 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-4 xl:grid-cols-5">
              {error ? (
                <div className="col-span-full text-center py-6">
                  <p className="text-red-500 dark:text-red-400 mb-2 text-sm sm:text-base">{error}</p>
                  <button
                    onClick={() => {
                      setPage(0);
                      setProducts([]);
                      setInitialLoad(true);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs sm:text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : initialLoad ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))
              ) : products.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center min-h-[150px] space-y-1 sm:min-h-[200px] sm:space-y-2">
                  <p className="text-gray-900 dark:text-gray-100 text-sm sm:text-base">
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
                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs sm:text-sm"
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
                    <div className="col-span-full flex justify-center items-center py-3 sm:py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-500 sm:w-8 sm:h-8" />
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