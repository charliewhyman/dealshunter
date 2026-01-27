import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState, useMemo, startTransition } from 'react';
import { ProductWithDetails } from '../types';
import { getSupabase } from '../lib/supabase';
import AsyncLucideIcon from '../components/AsyncLucideIcon';
import { ProductCard } from '../components/ProductCard';
import { Header } from '../components/Header';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MultiSelectDropdown, SingleSelectDropdown } from '../components/Dropdowns';
import TransformSlider from '../components/TransformSlider';

const ITEMS_PER_PAGE = 20;
const LCP_PRELOAD_COUNT = 4;

type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

// Debounce utility
function createDebounced<Args extends unknown[]>(fn: (...args: Args) => void, wait: number) {
  let timer: number | undefined;
  const debounced = ((...args: Args) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait) as unknown as number;
  }) as ((...args: Args) => void) & { cancel?: () => void };
  debounced.cancel = () => { if (timer) { window.clearTimeout(timer); timer = undefined; } };
  return debounced;
}

function rangesEqual(a: [number, number], b: [number, number]) {
  return a[0] === b[0] && a[1] === b[1];
}

interface FilterOptions {
  selectedShopName: string[];
  selectedSizeGroups: string[];
  selectedGroupedTypes: string[];
  selectedTopLevelCategories: string[];
  selectedGenderAges: string[];
  onSaleOnly: boolean;
  searchQuery: string;
  selectedPriceRange: [number, number];
}

export function HomePage() {
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [searchParams] = useSearchParams();
  const urlSearchQuery = searchParams.get('search') || '';
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopList, setShopList] = useState<Array<{id: number; shop_name: string}>>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      const stored = localStorage.getItem('sortOrder');
      if (stored === 'price_asc' || stored === 'price_desc' || stored === 'discount_desc') 
        return stored as SortOrder;
    } catch (error) {
      console.error('Failed to retrieve sortOrder from localStorage:', error);
    }
    return 'discount_desc';
  });
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState<string>(() => {
    try {
      const fromUrl = new URLSearchParams(location.search).get('search');
      if (fromUrl != null) return fromUrl;
      const fromStorage = localStorage.getItem('searchQuery');
      if (fromStorage) return fromStorage;
    } catch (error) {
      console.error('Failed to retrieve searchQuery from localStorage or URL:', error);
    }
    return '';
  });

  // Filter states with localStorage
  const [selectedShopName, setSelectedShopName] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedShopName');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse selectedShopName from localStorage:', error);
      return [];
    }
  });

  const [selectedGroupedTypes, setSelectedGroupedTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedGroupedTypes');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse selectedGroupedTypes from localStorage:', error);
      return [];
    }
  });

  const [selectedTopLevelCategories, setSelectedTopLevelCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedTopLevelCategories');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse selectedTopLevelCategories from localStorage:', error);
      return [];
    }
  });

  const [selectedGenderAges, setSelectedGenderAges] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedGenderAges');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse selectedGenderAges from localStorage:', error);
      return [];
    }
  });
  
  const [onSaleOnly, setOnSaleOnly] = useState<boolean>(
    JSON.parse(localStorage.getItem('onSaleOnly') || 'false')
  );

  const PRICE_RANGE = useMemo<[number, number]>(() => [15, 1000], []);
  const ABS_MIN_PRICE = 0;
  const ABS_MAX_PRICE = 100000;
  
  const [selectedPriceRange, setSelectedPriceRange] = useState<[number, number]>(() => {
    try {
      const savedRange = JSON.parse(localStorage.getItem('selectedPriceRange') || 'null');
      if (Array.isArray(savedRange) && savedRange.length === 2 &&
          typeof savedRange[0] === 'number' && typeof savedRange[1] === 'number' &&
          savedRange[0] <= savedRange[1] && savedRange[0] >= ABS_MIN_PRICE && savedRange[1] <= ABS_MAX_PRICE) {
        return [savedRange[0], savedRange[1]];
      }
    } catch (error) {
      console.error('Failed to parse selectedPriceRange from localStorage:', error);
    }
    return [...PRICE_RANGE];
  });

  const [selectedSizeGroups, setSelectedSizeGroups] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedSizeGroups');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Failed to parse selectedSizeGroups from localStorage:', error);
      return [];
    }
  });

  const [productPricings, setProductPricings] = useState<Record<string, {
    variantPrice: number | null; 
    compareAtPrice: number | null; 
    offerPrice: number | null;
  }>>({});

  // Filter dropdown data
  const [allSizeData, setAllSizeData] = useState<{size_group: string}[]>([]);
  const [allGroupedTypes, setAllGroupedTypes] = useState<Array<{grouped_product_type: string}>>([]);
  const [allTopLevelCategories, setAllTopLevelCategories] = useState<Array<{top_level_category: string}>>([]);
  const [allGenderAges, setAllGenderAges] = useState<Array<{gender_age: string}>>([]);

  // Refs for performance
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pricedIdsRef = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef(false);
  const observerLockRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const prefetchCacheRef = useRef<Record<string, { data: ProductWithDetails[] }>>({});
  const filterCacheRef = useRef<Map<string, { data: unknown[]; timestamp: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000;

  // Schedule idle callback
  const scheduleIdle = useCallback((task: () => void) => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
    if (w.requestIdleCallback) {
      try {
        w.requestIdleCallback(() => {
          try { task(); } catch (error) {
            console.error('Error in scheduled idle callback:', error);
          }
        }, { timeout: 2000 });
        return;
      } catch (error) {
        console.error('Failed to schedule idle callback:', error);
      }
    }
    setTimeout(() => { try { task(); } catch (error) {
      console.error('Error in setTimeout callback:', error);
    } }, 200);
  }, []);

  // Fetch pricing for products
  const fetchBatchPricingFor = useCallback(async (ids: Array<number | string>) => {
    const uniqueIds = Array.from(new Set(ids.map(String))).filter(Boolean);
    if (uniqueIds.length === 0) return;
    
    const idsToFetch = uniqueIds.filter(id => !(id in productPricings));
    if (idsToFetch.length === 0) return;
    
    const supabase = getSupabase();
    const pricingMap: Record<string, {variantPrice: number | null; compareAtPrice: number | null; offerPrice: number | null;}> = {};
    
    try {
      const numericIds = idsToFetch.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
      if (numericIds.length === 0) return;
      
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_products_pricing', { 
        p_product_ids: numericIds
      });
      
      if (!rpcError && Array.isArray(rpcData)) {
        for (const row of rpcData) {
          const pid = String(row.product_id);
          pricingMap[pid] = {
            variantPrice: row.variant_price != null ? parseFloat(String(row.variant_price)) : null,
            compareAtPrice: row.compare_at_price != null ? parseFloat(String(row.compare_at_price)) : null,
            offerPrice: row.offer_price != null ? parseFloat(String(row.offer_price)) : null
          };
        }
      }
    } catch (error) {
      console.error('Error fetching pricing:', error);
    }
    
    setProductPricings(prev => ({ ...prev, ...pricingMap }));
  }, [productPricings]);

  const fetchPricingDebounced = useRef(
    createDebounced((ids: string[]) => {
      if (ids.length > 0) fetchBatchPricingFor(ids).catch((error) => {
        console.error('Failed to fetch batch pricing:', error);
      });
    }, 300)
  ).current;

  // Intersection observer for pricing
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const idsToFetch: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).getAttribute('data-prod-id');
          if (!id || pricedIdsRef.current.has(id)) continue;
          pricedIdsRef.current.add(id);
          idsToFetch.push(id);
        }
        if (idsToFetch.length > 0) fetchPricingDebounced(idsToFetch);
      },
      { rootMargin: '200px', threshold: 0.1 }
    );
    
    for (const el of cardRefs.current.values()) {
      try { io.observe(el); } catch (error) {
        console.error('Failed to observe element with IntersectionObserver:', error);
      }
    }
    
    return () => io.disconnect();
  }, [products, fetchPricingDebounced]);

  // Fetch with cache
  const fetchWithCache = useCallback(async <T,>(key: string, fetchFn: () => Promise<T[]>): Promise<T[]> => {
    const cached = filterCacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as T[];
    }
    
    const data = await fetchFn();
    filterCacheRef.current.set(key, { data: data as unknown[], timestamp: Date.now() });
    return data;
  }, [CACHE_TTL]);

  const mergeUniqueProducts = useCallback((prev: ProductWithDetails[], next: ProductWithDetails[]) => {
    const seen = new Set<string>();
    const out: ProductWithDetails[] = [];
    
    for (const p of prev) {
      const id = String(p.id);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(p);
      }
    }
    
    for (const p of next) {
      const id = String(p.id);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(p);
      }
    }
    
    return out;
  }, []);

  // Build RPC parameters
  const buildRpcParams = useCallback((filters: FilterOptions, page: number, sortOrder: SortOrder) => {
    return {
      p_shop_ids: filters.selectedShopName.filter(s => s.trim()),
      p_size_groups: filters.selectedSizeGroups.filter(s => s.trim()),
      p_grouped_types: filters.selectedGroupedTypes.filter(s => s.trim()),
      p_top_level_categories: filters.selectedTopLevelCategories.filter(s => s.trim()),
      p_gender_ages: filters.selectedGenderAges.filter(s => s.trim()),
      p_on_sale_only: filters.onSaleOnly,
      p_min_price: filters.selectedPriceRange[0],
      p_max_price: filters.selectedPriceRange[1],
      p_search_query: filters.searchQuery?.trim() || null,
      p_limit: ITEMS_PER_PAGE,
      p_offset: page * ITEMS_PER_PAGE,
      p_sort_order: sortOrder === 'price_asc' ? 'price_asc' : 
                    sortOrder === 'price_desc' ? 'price_desc' : 'discount_desc'
    };
  }, []);

  // Main fetch function with LIMIT+1 pattern
  const fetchFilteredProducts = useCallback(async (
    filters: FilterOptions,
    page: number,
    sortOrder: SortOrder,
    isFilterChange: boolean = false
  ) => {
    const requestKey = `${JSON.stringify(filters)}-${page}-${sortOrder}`;
    
    // Clear cache on filter change
    if (isFilterChange) {
      prefetchCacheRef.current = {};
      startTransition(() => setProducts([]));
    }
    
    // Check cache first
    const cached = prefetchCacheRef.current[requestKey];
    if (cached) {
      const hasMoreData = cached.data.length > ITEMS_PER_PAGE;
      const productsToShow = hasMoreData ? cached.data.slice(0, ITEMS_PER_PAGE) : cached.data;
      
      startTransition(() => {
        setProducts(prev => page === 0 || isFilterChange ? productsToShow : mergeUniqueProducts(prev, productsToShow));
        setHasMore(hasMoreData);
      });
      
      setInitialLoad(false);
      setError(null);
      setLoading(false);
      isFetchingRef.current = false;
      observerLockRef.current = false;
      
      // Prefetch next page
      if (hasMoreData) {
        scheduleIdle(async () => {
          const nextKey = `${JSON.stringify(filters)}-${page + 1}-${sortOrder}`;
          if (!prefetchCacheRef.current[nextKey]) {
            try {
              const supabase = getSupabase();
              const params = buildRpcParams(filters, page + 1, sortOrder);
              const { data: nextData } = await supabase.rpc('get_products_filtered', params);
              
              if (Array.isArray(nextData)) {
                prefetchCacheRef.current[nextKey] = { data: nextData as ProductWithDetails[] };
                const ids = nextData.slice(0, ITEMS_PER_PAGE).map(p => p.id).filter(Boolean);
                if (ids.length) fetchBatchPricingFor(ids);
              }
            } catch (error) {
              console.error('Failed to prefetch next page:', error);
            }
          }
        });
      }
      
      return;
    }
    
    // Fetch from database
    const controller = new AbortController();
    currentRequestRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    isFetchingRef.current = true;
    setLoading(true);
    
    try {
      const supabase = getSupabase();
      const params = buildRpcParams(filters, page, sortOrder);
      const { data, error } = await supabase.rpc('get_products_filtered', params);
      
      clearTimeout(timeoutId);
      
      if (error) throw error;
      
      const newData = (data as ProductWithDetails[]) || [];
      const hasMoreData = newData.length > ITEMS_PER_PAGE;
      const productsToShow = hasMoreData ? newData.slice(0, ITEMS_PER_PAGE) : newData;
      
      // Store in cache with full data (including +1)
      prefetchCacheRef.current[requestKey] = { data: newData };
      
      // Update state
      startTransition(() => {
        setProducts(prev => page === 0 || isFilterChange ? productsToShow : mergeUniqueProducts(prev, productsToShow));
        setHasMore(hasMoreData);
      });
      
      // Fetch pricing
      if (productsToShow.length > 0) {
        const ids = productsToShow.map(p => p.id).filter(Boolean);
        scheduleIdle(() => fetchBatchPricingFor(ids));
      }
      
      // Prefetch next page
      if (hasMoreData) {
        scheduleIdle(async () => {
          const nextKey = `${JSON.stringify(filters)}-${page + 1}-${sortOrder}`;
          if (!prefetchCacheRef.current[nextKey]) {
            try {
              const nextParams = buildRpcParams(filters, page + 1, sortOrder);
              const { data: nextData } = await supabase.rpc('get_products_filtered', nextParams);
              
              if (Array.isArray(nextData)) {
                prefetchCacheRef.current[nextKey] = { data: nextData as ProductWithDetails[] };
                const nextIds = nextData.slice(0, ITEMS_PER_PAGE).map(p => p.id).filter(Boolean);
                if (nextIds.length) fetchBatchPricingFor(nextIds);
              }
            } catch (error) {
              console.error('Failed to prefetch next page from database:', error);
            }
          }
        });
      }
      
      setInitialLoad(false);
      setError(null);
    } catch (err) {
      const maybeErr = err as { name?: string; message?: string };
      if (maybeErr.name === 'AbortError' || maybeErr.message?.includes('AbortError')) {
        console.warn('Request was aborted:', maybeErr);
        return;
      }
      
      console.error('Fetch error in fetchFilteredProducts:', err);
      setError('Failed to load products. Please try again.');
      setHasMore(false);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        isFetchingRef.current = false;
        observerLockRef.current = false;
      }
    }
  }, [fetchBatchPricingFor, scheduleIdle, mergeUniqueProducts, buildRpcParams]);

  // Fetch initial filter data
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const supabase = getSupabase();
        
        const shopData = await fetchWithCache('distinct_shops', async () => {
          const { data } = await supabase.from('distinct_shops').select('id, name').order('name');
          return data || [];
        });
        setShopList(shopData.map(item => ({ id: Number(item.id || 0), shop_name: item.name || '' })).filter(item => item.shop_name));
        
        const sizeData = await fetchWithCache('size_groups', async () => {
          const { data } = await supabase.from('distinct_size_groups').select('size_group');
          return data || [];
        });
        setAllSizeData(sizeData.map(item => ({ size_group: String(item.size_group || '') })).filter(item => item.size_group));
        
        const groupedTypeData = await fetchWithCache('grouped_types', async () => {
          const { data } = await supabase.from('distinct_grouped_types').select('grouped_product_type');
          return data || [];
        });
        setAllGroupedTypes(groupedTypeData.map(item => ({ grouped_product_type: String(item.grouped_product_type || '') })).filter(item => item.grouped_product_type).sort((a, b) => a.grouped_product_type.localeCompare(b.grouped_product_type)));
        
        const topLevelData = await fetchWithCache('top_level_categories', async () => {
          const { data } = await supabase.from('distinct_top_level_categories').select('top_level_category');
          return data || [];
        });
        setAllTopLevelCategories(topLevelData.map(item => ({ top_level_category: String(item.top_level_category || '') })).filter(item => item.top_level_category).sort((a, b) => a.top_level_category.localeCompare(b.top_level_category)));
        
        const genderData = await fetchWithCache('gender_ages', async () => {
          const { data } = await supabase.from('distinct_gender_ages').select('gender_age');
          return data || [];
        });
        setAllGenderAges(genderData.map(item => ({ gender_age: String(item.gender_age || '') })).filter(item => item.gender_age).sort((a, b) => a.gender_age.localeCompare(b.gender_age)));
      } catch (error) {
        console.error('Failed to fetch initial filter data:', error);
      }
    }
    
    fetchInitialData();
  }, [fetchWithCache]);

  // Committed filters state
  const [committedFilters, setCommittedFilters] = useState<FilterOptions>(() => ({
    selectedShopName,
    selectedSizeGroups,
    selectedGroupedTypes,
    selectedTopLevelCategories,
    selectedGenderAges,
    onSaleOnly,
    searchQuery,
    selectedPriceRange,
  }));

  // Memoized keys for change detection
  const selectedShopNameKey = useMemo(() => JSON.stringify(selectedShopName), [selectedShopName]);
  const selectedSizeGroupsKey = useMemo(() => JSON.stringify(selectedSizeGroups), [selectedSizeGroups]);
  const selectedGroupedTypesKey = useMemo(() => JSON.stringify(selectedGroupedTypes), [selectedGroupedTypes]);
  const selectedTopLevelCategoriesKey = useMemo(() => JSON.stringify(selectedTopLevelCategories), [selectedTopLevelCategories]);
  const selectedGenderAgesKey = useMemo(() => JSON.stringify(selectedGenderAges), [selectedGenderAges]);
  const selectedPriceRangeKey = useMemo(() => JSON.stringify(selectedPriceRange), [selectedPriceRange]);
  const committedFiltersKey = useMemo(() => JSON.stringify(committedFilters), [committedFilters]);

  // Sync search query with URL
  useEffect(() => {
    setSearchQuery(urlSearchQuery);
  }, [urlSearchQuery]);

  // Update committed filters when any filter changes
  useEffect(() => {
    const pendingFilters: FilterOptions = {
      selectedShopName: JSON.parse(selectedShopNameKey),
      selectedSizeGroups: JSON.parse(selectedSizeGroupsKey),
      selectedGroupedTypes: JSON.parse(selectedGroupedTypesKey),
      selectedTopLevelCategories: JSON.parse(selectedTopLevelCategoriesKey),
      selectedGenderAges: JSON.parse(selectedGenderAgesKey),
      onSaleOnly,
      searchQuery,
      selectedPriceRange: JSON.parse(selectedPriceRangeKey) as [number, number],
    };
    
    const pendingKey = JSON.stringify(pendingFilters);
    if (pendingKey === committedFiltersKey) return;
    
    setPage(0);
    setProducts([]);
    setInitialLoad(true);
    setHasMore(true);
    setCommittedFilters(pendingFilters);
  }, [
    selectedShopNameKey, selectedSizeGroupsKey, selectedGroupedTypesKey,
    selectedTopLevelCategoriesKey, selectedGenderAgesKey,
    onSaleOnly, searchQuery, selectedPriceRangeKey, committedFiltersKey
  ]);

  // Reset on sort order change
  useEffect(() => {
    setPage(0);
    setProducts([]);
    setInitialLoad(true);
    setHasMore(true);
  }, [sortOrder]);

  // Initial load
  useEffect(() => {
    if (initialLoad && page === 0) {
      fetchFilteredProducts(committedFilters, 0, sortOrder, true).catch((error) => {
        console.error('Failed to fetch filtered products on initial load:', error);
      });
    }
  }, [initialLoad, committedFilters, sortOrder, fetchFilteredProducts, page]);

  // Fetch when page changes
  useEffect(() => {
    if (page === 0) return;
    fetchFilteredProducts(committedFilters, page, sortOrder, false).catch((error) => {
      console.error('Failed to fetch filtered products on page change:', error);
    });
  }, [page, sortOrder, fetchFilteredProducts, committedFilters]);

  // Persist to localStorage
  useEffect(() => { 
    try {
      localStorage.setItem('selectedShopName', JSON.stringify(selectedShopName)); 
    } catch (error) {
      console.error('Failed to persist selectedShopName to localStorage:', error);
    }
  }, [selectedShopName]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('selectedGroupedTypes', JSON.stringify(selectedGroupedTypes)); 
    } catch (error) {
      console.error('Failed to persist selectedGroupedTypes to localStorage:', error);
    }
  }, [selectedGroupedTypes]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('selectedTopLevelCategories', JSON.stringify(selectedTopLevelCategories)); 
    } catch (error) {
      console.error('Failed to persist selectedTopLevelCategories to localStorage:', error);
    }
  }, [selectedTopLevelCategories]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('selectedGenderAges', JSON.stringify(selectedGenderAges)); 
    } catch (error) {
      console.error('Failed to persist selectedGenderAges to localStorage:', error);
    }
  }, [selectedGenderAges]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('onSaleOnly', JSON.stringify(onSaleOnly)); 
    } catch (error) {
      console.error('Failed to persist onSaleOnly to localStorage:', error);
    }
  }, [onSaleOnly]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('searchQuery', searchQuery); 
    } catch (error) {
      console.error('Failed to persist searchQuery to localStorage:', error);
    }
  }, [searchQuery]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('sortOrder', sortOrder); 
    } catch (error) {
      console.error('Failed to persist sortOrder to localStorage:', error);
    }
  }, [sortOrder]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('selectedPriceRange', JSON.stringify(selectedPriceRange)); 
    } catch (error) {
      console.error('Failed to persist selectedPriceRange to localStorage:', error);
    }
  }, [selectedPriceRange]);
  
  useEffect(() => { 
    try {
      localStorage.setItem('selectedSizeGroups', JSON.stringify(selectedSizeGroups)); 
    } catch (error) {
      console.error('Failed to persist selectedSizeGroups to localStorage:', error);
    }
  }, [selectedSizeGroups]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !loading && !isFetchingRef.current && hasMore && !observerLockRef.current && products.length > 0) {
          observerLockRef.current = true;
          isFetchingRef.current = true;
          startTransition(() => setPage(prev => prev + 1));
        }
      },
      { rootMargin: '800px', threshold: 0.1 }
    );
    
    const currentRef = observerRef.current;
    if (currentRef) observer.observe(currentRef);
    
    return () => { if (currentRef) observer.unobserve(currentRef); };
  }, [loading, hasMore, products.length]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (currentRequestRef.current) currentRequestRef.current.abort();
      fetchPricingDebounced?.cancel?.();
      prefetchCacheRef.current = {};
    };
  }, [fetchPricingDebounced]);

  // Handlers
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value);
  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/?search=${searchQuery}`);
  };
  
  const handleSortChange = (value: string) => {
    setSortOrder(value as SortOrder);
    setCommittedFilters({
      selectedShopName, selectedSizeGroups, selectedGroupedTypes,
      selectedTopLevelCategories, selectedGenderAges,
      onSaleOnly, searchQuery, selectedPriceRange,
    });
    setPage(0);
  };

  const handleSliderChangeEnd = (values: number[]) => {
    const [minValue, maxValue] = values;
    setSelectedPriceRange([minValue, maxValue]);
  };

  const handlePriceInputChange = (type: 'min' | 'max', value: string) => {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return;
    
    if (type === 'min') {
      setSelectedPriceRange([Math.min(Math.max(numericValue, ABS_MIN_PRICE), selectedPriceRange[1]), selectedPriceRange[1]]);
    } else {
      setSelectedPriceRange([selectedPriceRange[0], Math.max(Math.min(numericValue, ABS_MAX_PRICE), selectedPriceRange[0])]);
    }
  };

  const handleClearAllFilters = () => {
    setSelectedShopName([]);
    setSelectedGroupedTypes([]);
    setSelectedTopLevelCategories([]);
    setSelectedGenderAges([]);
    setOnSaleOnly(false);
    setSelectedSizeGroups([]);
    setSelectedPriceRange([...PRICE_RANGE]);
    setSearchQuery('');
  };

  const sortOptions = [
    { value: 'price_asc', label: '$ Low-High' },
    { value: 'price_desc', label: '$ High-Low' },
    { value: 'discount_desc', label: '% High-Low' },
  ];

  const shopOptions = shopList.map(s => ({ value: String(s.id), label: s.shop_name }));
  const getShopLabel = useCallback((idOrName: string) => {
    const found = shopList.find(s => String(s.id) === idOrName);
    return found ? found.shop_name : idOrName;
  }, [shopList]);

  const sizeOptions = Array.from(new Set(allSizeData.map(item => item.size_group))).filter(Boolean).map(size => ({ value: size, label: size }));
  const groupedTypeOptions = Array.from(new Set(allGroupedTypes.map(item => item.grouped_product_type))).filter(Boolean).map(type => ({ value: type, label: type }));

  const topLevelOptions = Array.from(new Set(allTopLevelCategories.map(item => item.top_level_category))).filter(Boolean).map(cat => ({ value: cat, label: cat }));
  const genderAgeOptions = Array.from(new Set(allGenderAges.map(item => item.gender_age))).filter(Boolean).map(gen => ({ value: gen, label: gen }));

  function ProductCardSkeleton() {
    return (
      <div className="w-full h-full min-h-[320px] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 animate-pulse sm:p-4 flex flex-col">
        <div className="h-5 sm:h-6 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2 mb-3 sm:mb-4"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-full mb-1"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-5/6 mb-1"></div>
        <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-700 rounded w-2/3 mt-auto"></div>
      </div>
    );
  }

  function ProductGridSkeleton({ count }: { count: number }) {
    return (
      <>
        {Array.from({ length: count }).map((_, i) => (
          <div key={`skeleton-${i}`} className="h-full">
            <ProductCardSkeleton />
          </div>
        ))}
      </>
    );
  }

  const isFetchingEmpty = products.length === 0 && loading;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Header
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      
      <div className="mx-auto px-4 py-4 mt-16 sm:px-6 sm:py-6 lg:px-8 max-w-screen-2xl">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* Filters Sidebar */}
          <div className="w-full lg:w-80 xl:w-96">
            <div className="lg:hidden mb-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center justify-between w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-sm sm:px-4 sm:py-3"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:text-base">Filters</span>
                  {(selectedShopName.length > 0 || selectedGroupedTypes.length > 0 || selectedTopLevelCategories.length > 0 || selectedGenderAges.length > 0 || onSaleOnly || !rangesEqual(selectedPriceRange, PRICE_RANGE)) && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold text-white bg-blue-600 rounded-full sm:px-2 sm:py-1">Active</span>
                  )}
                </div>
                <AsyncLucideIcon name={showFilters ? "ChevronUp" : "ChevronDown"} className="h-4 w-4 text-gray-600 dark:text-gray-400 sm:h-5 sm:w-5" />
              </button>
            </div>

            <div className={`${showFilters ? 'block' : 'hidden'} lg:block lg:sticky lg:top-24 lg:self-start`}>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 space-y-4 sm:p-4 sm:space-y-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Shops {selectedShopName.length > 0 && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({selectedShopName.length})</span>}
                  </h3>
                  <MultiSelectDropdown options={shopOptions} selected={selectedShopName} onChange={setSelectedShopName} placeholder="All shops" />
                </div>

                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Product Types {selectedGroupedTypes.length > 0 && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({selectedGroupedTypes.length})</span>}
                  </h3>
                  <MultiSelectDropdown options={groupedTypeOptions} selected={selectedGroupedTypes} onChange={setSelectedGroupedTypes} placeholder="All types" />
                </div>

                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Categories {selectedTopLevelCategories.length > 0 && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({selectedTopLevelCategories.length})</span>}
                  </h3>
                  <MultiSelectDropdown options={topLevelOptions} selected={selectedTopLevelCategories} onChange={setSelectedTopLevelCategories} placeholder="All categories" />
                </div>

                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Gender/Age {selectedGenderAges.length > 0 && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({selectedGenderAges.length})</span>}
                  </h3>
                  <MultiSelectDropdown options={genderAgeOptions} selected={selectedGenderAges} onChange={setSelectedGenderAges} placeholder="All" />
                </div>

                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">Price Range</h3>
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="relative w-full">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                        <input type="number" value={selectedPriceRange[0]} onChange={(e) => handlePriceInputChange('min', e.target.value)} className="w-full pl-6 pr-2 py-1 border border-gray-300 rounded-md text-sm" min={ABS_MIN_PRICE} max={selectedPriceRange[1]} />
                      </div>
                      <span className="text-gray-500 text-sm">to</span>
                      <div className="relative w-full">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                        <input type="number" value={selectedPriceRange[1]} onChange={(e) => handlePriceInputChange('max', e.target.value)} className="w-full pl-6 pr-2 py-1 border border-gray-300 rounded-md text-sm" min={selectedPriceRange[0]} max={ABS_MAX_PRICE} />
                      </div>
                    </div>
                    <TransformSlider step={1} min={Math.min(PRICE_RANGE[0], selectedPriceRange[0])} max={Math.max(PRICE_RANGE[1], selectedPriceRange[1])} value={selectedPriceRange} onFinalChange={handleSliderChangeEnd} />
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
                    Sizes {selectedSizeGroups.length > 0 && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">({selectedSizeGroups.length})</span>}
                  </h3>
                  <MultiSelectDropdown options={sizeOptions} selected={selectedSizeGroups} onChange={setSelectedSizeGroups} placeholder="All sizes" />
                </div>

                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">Filters</h3>
                  <div className="flex gap-4 sm:gap-6">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={onSaleOnly} onChange={(e) => setOnSaleOnly(e.target.checked)} className="h-3.5 w-3.5 text-blue-600 border-gray-300 rounded" />
                      <span className="text-xs text-gray-700 dark:text-gray-300 sm:text-sm">On Sale</span>
                    </label>
                  </div>
                </div>

                {(selectedShopName.length > 0 || selectedGroupedTypes.length > 0 || selectedTopLevelCategories.length > 0 || selectedGenderAges.length > 0 || onSaleOnly || !rangesEqual(selectedPriceRange, PRICE_RANGE) || selectedSizeGroups.length > 0) && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700 sm:pt-4">
                    <div className="space-y-2 sm:space-y-3">
                      <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 sm:text-sm">Active filters</h3>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedShopName.map(shop => (
                          <div key={shop} className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 sm:px-2 sm:py-1">
                            {getShopLabel(shop)}
                            <button onClick={() => setSelectedShopName(prev => prev.filter(s => s !== shop))} className="ml-1 text-blue-500 hover:text-blue-700">
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        ))}
                        {selectedGroupedTypes.map(type => (
                          <div key={type} className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 sm:px-2 sm:py-1">
                            {type}
                            <button onClick={() => setSelectedGroupedTypes(prev => prev.filter(t => t !== type))} className="ml-1 text-blue-500 hover:text-blue-700">
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        ))}
                        {selectedTopLevelCategories.map(cat => (
                          <div key={cat} className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 sm:px-2 sm:py-1">
                            {cat}
                            <button onClick={() => setSelectedTopLevelCategories(prev => prev.filter(c => c !== cat))} className="ml-1 text-blue-500 hover:text-blue-700">
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        ))}
                        {selectedGenderAges.map(gen => (
                          <div key={gen} className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 sm:px-2 sm:py-1">
                            {gen}
                            <button onClick={() => setSelectedGenderAges(prev => prev.filter(g => g !== gen))} className="ml-1 text-blue-500 hover:text-blue-700">
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        ))}
                        {selectedSizeGroups.map(size => (
                          <div key={size} className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 sm:px-2 sm:py-1">
                            {size}
                            <button onClick={() => setSelectedSizeGroups(prev => prev.filter(s => s !== size))} className="ml-1 text-blue-500 hover:text-blue-700">
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        ))}
                        {!rangesEqual(selectedPriceRange, PRICE_RANGE) && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 sm:px-2 sm:py-1">
                            ${selectedPriceRange[0]} - ${selectedPriceRange[1]}
                            <button onClick={() => setSelectedPriceRange([...PRICE_RANGE])} className="ml-1 text-blue-500 hover:text-blue-700">
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        )}
                        {onSaleOnly && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 sm:px-2 sm:py-1">
                            On Sale
                            <button onClick={() => setOnSaleOnly(false)} className="ml-1 text-blue-500 hover:text-blue-700">
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <button onClick={handleClearAllFilters} className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 w-full text-left sm:text-sm">
                        Clear all filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1">
            <div className="mb-3 flex justify-end sm:mb-4">
              <div className="w-40 sm:w-48">
                <SingleSelectDropdown options={sortOptions} selected={sortOrder} onChange={handleSortChange} placeholder="Sort" />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                <button onClick={() => { setError(null); setPage(0); setProducts([]); setInitialLoad(true); }} className="mt-2 text-red-600 dark:text-red-400 hover:underline text-xs">
                  Try again
                </button>
              </div>
            )}

            <div className="relative min-h-[400px]">
              {/* UPDATED PRODUCT GRID - Mobile-first responsive design */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {initialLoad ? (
                  <ProductGridSkeleton count={10} />
                ) : isFetchingEmpty ? (
                  <div className="col-span-full flex flex-col items-center justify-center min-h-[200px]">
                    <AsyncLucideIcon name="Loader2" className="animate-spin h-8 w-8 text-gray-600 dark:text-gray-300 mb-3" />
                    <p className="text-gray-900 dark:text-gray-100 text-sm">Loading products…</p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center min-h-[200px]">
                    <p className="text-gray-900 dark:text-gray-100 text-sm">No products match your filters.</p>
                    <button onClick={() => { setPage(0); setProducts([]); setInitialLoad(true); }} className="text-blue-600 dark:text-blue-400 hover:underline text-xs mt-2">
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    {products.map((product, index) => {
                      const pid = String(product.id);
                      return (
                        <div
                          key={`${product.id}-${product.shop_id}`}
                          data-prod-id={pid}
                          ref={(el) => {
                            if (el) cardRefs.current.set(pid, el);
                            else cardRefs.current.delete(pid);
                          }}
                          className="transform transition-transform duration-300 hover:-translate-y-1 active:scale-[0.98] touch-manipulation"
                        >
                          <ProductCard 
                            product={product} 
                            pricing={productPricings[pid]} 
                            isLcp={page === 0 && index < LCP_PRELOAD_COUNT}
                          />
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {loading && page > 0 && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-center py-4">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg">
                    <AsyncLucideIcon name="Loader2" className="animate-spin h-6 w-6 text-gray-600 dark:text-gray-300" />
                  </div>
                </div>
              )}

              <div ref={observerRef} className="h-10" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}