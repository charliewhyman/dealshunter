import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState, useMemo, startTransition } from 'react';
import { ProductWithDetails } from '../types';
import { getSupabase } from '../lib/supabase';
import AsyncLucideIcon from '../components/AsyncLucideIcon';
import { ProductCard } from '../components/ProductCard';
import { Header } from '../components/Header';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MultiSelectDropdown, SingleSelectDropdown } from '../components/Dropdowns';
import TransformSlider from '../components/TransformSlider';

// ============================================================================
// CONSTANTS
// ============================================================================
const ITEMS_PER_PAGE = 30;
const LCP_PRELOAD_COUNT = 4;
const LOAD_COOLDOWN = 1000;
const MAX_AUTO_LOADS = 3;
const INTERSECTION_ROOT_MARGIN = '200px';
const INTERSECTION_THRESHOLD = 0.1;
const PRICING_DEBOUNCE_MS = 300;
const OBSERVER_CHECK_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_CACHE_ENTRIES = 10;
const FILTER_OPTIONS_CACHE_KEY = 'filter_options_cache';
const FILTER_OPTIONS_TTL = 24 * 60 * 60 * 1000; // 24 hours

type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc' | 'newest';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

// Safe localStorage operations
const safeLocalStorageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    if (error instanceof DOMException && 
        (error.name === 'QuotaExceededError' || 
         error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('LocalStorage quota exceeded, clearing non-essential data');
      
      // Keep only essential keys
      const essentialKeys = [
        'sortOrder', 'searchQuery', 'selectedShopName', 'selectedSizeGroups',
        'selectedGroupedTypes', 'selectedTopLevelCategories', 'selectedGenderAges',
        'onSaleOnly', 'selectedPriceRange'
      ];
      
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (storageKey && !essentialKeys.includes(storageKey)) {
          localStorage.removeItem(storageKey);
        }
      }
      
      // Retry
      try {
        localStorage.setItem(key, value);
      } catch (retryError) {
        console.error('Failed to save to localStorage even after cleanup:', retryError);
      }
    } else {
      console.error('Failed to save to localStorage:', error);
    }
  }
};

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function HomePage() {
  // ============================================================================
  // STATE - Core
  // ============================================================================
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isFilterChanging, setIsFilterChanging] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Hybrid loading state
  const autoLoadCountRef = useRef(0);
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // ============================================================================
  // STATE - Filter Options (Dropdowns)
  // ============================================================================
  const [shopList, setShopList] = useState<Array<{id: number; shop_name: string}>>([]);
  const [allSizeData, setAllSizeData] = useState<{size_group: string}[]>([]);
  const [allGroupedTypes, setAllGroupedTypes] = useState<Array<{grouped_product_type: string}>>([]);
  const [allTopLevelCategories, setAllTopLevelCategories] = useState<Array<{top_level_category: string}>>([]);
  const [allGenderAges, setAllGenderAges] = useState<Array<{gender_age: string}>>([]);

  // ============================================================================
  // STATE - User Selections (with localStorage)
  // ============================================================================
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      const stored = localStorage.getItem('sortOrder');
      if (stored === 'price_asc' || stored === 'price_desc' || stored === 'discount_desc' || stored === 'newest') 
        return stored as SortOrder;
    } catch (error) {
      console.error('Failed to retrieve sortOrder from localStorage:', error);
    }
    return 'discount_desc';
  });

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
  
  const [onSaleOnly, setOnSaleOnly] = useState<boolean>(() => {
    try {
      return JSON.parse(localStorage.getItem('onSaleOnly') || 'false');
    } catch (error) {
      console.error('Failed to parse onSaleOnly from localStorage:', error);
      return false;
    }
  });

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

  // ============================================================================
  // REFS
  // ============================================================================
  const observerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pricedIdsRef = useRef<Set<string>>(new Set());
  const isFetchingRef = useRef(false);
  const observerLockRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const inFlightRequestsRef = useRef<Set<string>>(new Set());
  const prefetchCacheRef = useRef<Record<string, { data: ProductWithDetails[] }>>({});
  const filterCacheRef = useRef<Map<string, { data: unknown[]; timestamp: number }>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000;
  const canLoadMoreRef = useRef(true);
  const prevFilterKeyRef = useRef<string>('');

  // ============================================================================
  // EFFECTS - LocalStorage Sync
  // ============================================================================
  
  // Sync sortOrder to localStorage
  useEffect(() => {
    safeLocalStorageSet('sortOrder', sortOrder);
  }, [sortOrder]);

  // Sync searchQuery to localStorage
  useEffect(() => {
    safeLocalStorageSet('searchQuery', searchQuery);
  }, [searchQuery]);

  // Sync selectedShopName to localStorage
  useEffect(() => {
    safeLocalStorageSet('selectedShopName', JSON.stringify(selectedShopName));
  }, [selectedShopName]);

  // Sync selectedSizeGroups to localStorage
  useEffect(() => {
    safeLocalStorageSet('selectedSizeGroups', JSON.stringify(selectedSizeGroups));
  }, [selectedSizeGroups]);

  // Sync selectedGroupedTypes to localStorage
  useEffect(() => {
    safeLocalStorageSet('selectedGroupedTypes', JSON.stringify(selectedGroupedTypes));
  }, [selectedGroupedTypes]);

  // Sync selectedTopLevelCategories to localStorage
  useEffect(() => {
    safeLocalStorageSet('selectedTopLevelCategories', JSON.stringify(selectedTopLevelCategories));
  }, [selectedTopLevelCategories]);

  // Sync selectedGenderAges to localStorage
  useEffect(() => {
    safeLocalStorageSet('selectedGenderAges', JSON.stringify(selectedGenderAges));
  }, [selectedGenderAges]);

  // Sync onSaleOnly to localStorage
  useEffect(() => {
    safeLocalStorageSet('onSaleOnly', JSON.stringify(onSaleOnly));
  }, [onSaleOnly]);

  // Sync selectedPriceRange to localStorage
  useEffect(() => {
    safeLocalStorageSet('selectedPriceRange', JSON.stringify(selectedPriceRange));
  }, [selectedPriceRange]);

  // Sync URL search parameter
  useEffect(() => {
    const urlSearch = searchParams.get('search');
    
    // Only update if URL param exists and differs from current state
    if (urlSearch !== null && urlSearch !== searchQuery) {
      setSearchQuery(urlSearch);
    }
  }, [searchParams]); // Don't include searchQuery to avoid loops

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
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

  // ============================================================================
  // PRICING FETCH
  // ============================================================================
  
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
    }, PRICING_DEBOUNCE_MS)
  ).current;

  // Clean up debounced function on unmount
  useEffect(() => {
    return () => {
      if (fetchPricingDebounced.cancel) {
        fetchPricingDebounced.cancel();
      }
    };
  }, [fetchPricingDebounced]);

  // ============================================================================
  // PRICING INTERSECTION OBSERVER (FIXED - No recreation on products change)
  // ============================================================================
  
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
      { rootMargin: INTERSECTION_ROOT_MARGIN, threshold: INTERSECTION_THRESHOLD }
    );
    
    // Initial observation
    const observeCurrentCards = () => {
      for (const el of cardRefs.current.values()) {
        try { 
          io.observe(el); 
        } catch (error) {
          console.error('Failed to observe element:', error);
        }
      }
    };
    
    observeCurrentCards();
    
    // Set up periodic re-observation for new cards
    const intervalId = setInterval(() => {
      observeCurrentCards();
    }, OBSERVER_CHECK_INTERVAL_MS);
    
    return () => {
      clearInterval(intervalId);
      io.disconnect();
    };
  }, [fetchPricingDebounced]); // Don't depend on products!

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  
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
      p_limit: ITEMS_PER_PAGE + 1,
      p_offset: page * ITEMS_PER_PAGE,
      p_sort_order: sortOrder === 'price_asc' ? 'price_asc' : 
                    sortOrder === 'price_desc' ? 'price_desc' : 
                    sortOrder === 'newest' ? 'newest' : 'discount_desc'
    };
  }, []);

  // ============================================================================
  // MAIN FETCH FUNCTION (FIXED - With abort and proper cache handling)
  // ============================================================================
  
  const fetchFilteredProducts = useCallback(async (
    filters: FilterOptions,
    page: number,
    sortOrder: SortOrder,
    isFilterChange: boolean = false
  ) => {
    const requestKey = `${JSON.stringify(filters)}-${page}-${sortOrder}`;
    
    if (!isFilterChange && inFlightRequestsRef.current.has(requestKey)) {
      return;
    }
    
    inFlightRequestsRef.current.add(requestKey);
    
    if (isFilterChange) {
      // FIXED: Abort any in-flight request
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }
      currentRequestRef.current = null;
      
      // FIXED: Reset auto-load counter
      autoLoadCountRef.current = 0;
      prefetchCacheRef.current = {};
      
      startTransition(() => {
        setProducts([]);
        setShowLoadMoreButton(false);
        setIsFilterChanging(true);
      });
    }
    
    // Check cache first
    const cached = prefetchCacheRef.current[requestKey];
    if (cached) {
      const hasMoreData = cached.data.length > ITEMS_PER_PAGE;
      const productsToShow = hasMoreData ? cached.data.slice(0, ITEMS_PER_PAGE) : cached.data;
      
      setTimeout(() => {
        startTransition(() => {
          setProducts(prev => page === 0 || isFilterChange ? productsToShow : mergeUniqueProducts(prev, productsToShow));
          setHasMore(hasMoreData);
          setInitialLoad(false);
          setError(null);
          setLoading(false);
          setIsFilterChanging(false);
        });
      }, 0);
      
      isFetchingRef.current = false;
      observerLockRef.current = false;
      inFlightRequestsRef.current.delete(requestKey);
      
      canLoadMoreRef.current = false;
      setTimeout(() => {
        canLoadMoreRef.current = true;
      }, LOAD_COOLDOWN);
      
      if (!isFilterChange && page > 0) {
        autoLoadCountRef.current += 1;
        const newCount = autoLoadCountRef.current;
        
        startTransition(() => {
          if (newCount >= MAX_AUTO_LOADS) {
            setShowLoadMoreButton(true);
          }
        });
      }
      
      if (hasMoreData && autoLoadCountRef.current < MAX_AUTO_LOADS) {
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
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
      
      prefetchCacheRef.current[requestKey] = { data: newData };
      
      // FIXED: Prune cache to prevent memory leak
      const cacheKeys = Object.keys(prefetchCacheRef.current);
      if (cacheKeys.length > MAX_CACHE_ENTRIES) {
        const toRemove = cacheKeys.slice(0, cacheKeys.length - MAX_CACHE_ENTRIES);
        for (const key of toRemove) {
          delete prefetchCacheRef.current[key];
        }
      }
      
      setTimeout(() => {
        startTransition(() => {
          setProducts(prev => page === 0 || isFilterChange ? productsToShow : mergeUniqueProducts(prev, productsToShow));
          setHasMore(hasMoreData);
          setInitialLoad(false);
          setError(null);
          setLoading(false);
          setIsFilterChanging(false);
        });
      }, 0);
      
      if (productsToShow.length > 0) {
        const ids = productsToShow.map(p => p.id).filter(Boolean);
        scheduleIdle(() => fetchBatchPricingFor(ids));
      }
      
      if (!isFilterChange && page > 0) {
        autoLoadCountRef.current += 1;
        const newCount = autoLoadCountRef.current;
        
        startTransition(() => {
          if (newCount >= MAX_AUTO_LOADS) {
            setShowLoadMoreButton(true);
          }
        });
      }
      
      if (hasMoreData && autoLoadCountRef.current < MAX_AUTO_LOADS) {
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

    } catch (err) {
      const maybeErr = err as { name?: string; message?: string };
      if (maybeErr.name === 'AbortError' || maybeErr.message?.includes('AbortError')) {
        console.warn('Request was aborted:', maybeErr);
        return;
      }
      
      console.error('Fetch error in fetchFilteredProducts:', err);
      
      setTimeout(() => {
        startTransition(() => {
          setError('Failed to load products. Please try again.');
          setHasMore(false);
          setInitialLoad(false);
          setLoading(false);
          setIsFilterChanging(false);
        });
      }, 0);
    } finally {
      if (!controller.signal.aborted) {
        isFetchingRef.current = false;
        observerLockRef.current = false;
        inFlightRequestsRef.current.delete(requestKey);
      }
    }
  }, [mergeUniqueProducts, scheduleIdle, buildRpcParams, fetchBatchPricingFor]);

  // ============================================================================
  // FETCH INITIAL FILTER OPTIONS (With caching)
  // ============================================================================
  
  useEffect(() => {
    async function fetchInitialData() {
      try {
        // Try cache first
        const cached = localStorage.getItem(FILTER_OPTIONS_CACHE_KEY);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < FILTER_OPTIONS_TTL) {
              setShopList(parsed.shops || []);
              setAllSizeData(parsed.sizes || []);
              setAllGroupedTypes(parsed.types || []);
              setAllTopLevelCategories(parsed.categories || []);
              setAllGenderAges(parsed.genders || []);
              return;
            }
          } catch (parseError) {
            console.error('Failed to parse cached filter options:', parseError);
          }
        }
        
        // Fetch fresh data
        const supabase = getSupabase();
        
        const [shopsResult, sizesResult, typesResult, categoriesResult, gendersResult] = await Promise.all([
          fetchWithCache<{id: number; shop_name: string}>('shops', async () => {
            const { data } = await supabase.from('shops').select('id, shop_name').order('shop_name');
            return data || [];
          }),
          fetchWithCache<{size_group: string}>('sizes', async () => {
            const { data } = await supabase.from('product_sizes').select('size_group').order('size_group');
            const uniqueSizes = Array.from(new Set(data?.map(d => d.size_group) || [])).filter(Boolean);
            return uniqueSizes.map(sg => ({ size_group: sg }));
          }),
          fetchWithCache<{grouped_product_type: string}>('types', async () => {
            const { data } = await supabase.from('products').select('grouped_product_type').order('grouped_product_type');
            const uniqueTypes = Array.from(new Set(data?.map(d => d.grouped_product_type) || [])).filter(Boolean);
            return uniqueTypes.map(t => ({ grouped_product_type: t }));
          }),
          fetchWithCache<{top_level_category: string}>('categories', async () => {
            const { data } = await supabase.from('products').select('top_level_category').order('top_level_category');
            const uniqueCategories = Array.from(new Set(data?.map(d => d.top_level_category) || [])).filter(Boolean);
            return uniqueCategories.map(c => ({ top_level_category: c }));
          }),
          fetchWithCache<{gender_age: string}>('genders', async () => {
            const { data } = await supabase.from('products').select('gender_age').order('gender_age');
            const uniqueGenders = Array.from(new Set(data?.map(d => d.gender_age) || [])).filter(Boolean);
            return uniqueGenders.map(g => ({ gender_age: g }));
          })
        ]);
        
        setShopList(shopsResult);
        setAllSizeData(sizesResult);
        setAllGroupedTypes(typesResult);
        setAllTopLevelCategories(categoriesResult);
        setAllGenderAges(gendersResult);
        
        // Cache the results
        safeLocalStorageSet(FILTER_OPTIONS_CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          shops: shopsResult,
          sizes: sizesResult,
          types: typesResult,
          categories: categoriesResult,
          genders: gendersResult
        }));
        
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    }
    fetchInitialData();
  }, [fetchWithCache]);

  // ============================================================================
  // EFFECT - Monitor Filter Changes and Trigger Fetch (FIXED)
  // ============================================================================
  
  useEffect(() => {
    const currentFilters: FilterOptions = {
      selectedShopName,
      selectedSizeGroups,
      selectedGroupedTypes,
      selectedTopLevelCategories,
      selectedGenderAges,
      onSaleOnly,
      searchQuery,
      selectedPriceRange
    };
    
    const currentFilterKey = JSON.stringify(currentFilters);
    
    if (prevFilterKeyRef.current !== currentFilterKey) {
      // FIXED: Reset auto-load counter and state on filter change
      autoLoadCountRef.current = 0;
      setShowLoadMoreButton(false);
      setIsFilterChanging(true);
      setPage(0);
      setProducts([]);
      setHasMore(true);
      setError(null);
      
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }
      currentRequestRef.current = null;
      
      // Clear cache to force fresh fetch
      prefetchCacheRef.current = {};
    }
    
    prevFilterKeyRef.current = currentFilterKey;
    
    fetchFilteredProducts(currentFilters, page, sortOrder, prevFilterKeyRef.current !== currentFilterKey);
  }, [
    selectedShopName,
    selectedSizeGroups,
    selectedGroupedTypes,
    selectedTopLevelCategories,
    selectedGenderAges,
    onSaleOnly,
    searchQuery,
    selectedPriceRange,
    page,
    sortOrder,
    fetchFilteredProducts
  ]);

  // ============================================================================
  // INFINITE SCROLL OBSERVER (FIXED - Cleaner implementation)
  // ============================================================================
  
  useEffect(() => {
    const target = observerRef.current;
    
    if (!target || !hasMore || loading || showLoadMoreButton) {
      return;
    }
    
    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      
      if (entry.isIntersecting && 
          !isFetchingRef.current && 
          !observerLockRef.current && 
          canLoadMoreRef.current) {
        
        observerLockRef.current = true;
        canLoadMoreRef.current = false;
        
        setPage(p => p + 1);
        
        setTimeout(() => {
          canLoadMoreRef.current = true;
        }, LOAD_COOLDOWN);
      }
    };
    
    const io = new IntersectionObserver(handleIntersect, {
      rootMargin: '100px',
      threshold: INTERSECTION_THRESHOLD
    });
    
    io.observe(target);
    
    return () => {
      io.disconnect();
      observerLockRef.current = false;
    };
  }, [hasMore, loading, showLoadMoreButton]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    
    if (trimmedQuery) {
      navigate(`/?search=${encodeURIComponent(trimmedQuery)}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    navigate('/', { replace: true });
  };

  const handleSortChange = (value: string) => {
    setSortOrder(value as SortOrder);
  };

  const handleLoadMoreClick = () => {
    if (!loading && hasMore) {
      setPage(p => p + 1);
    }
  };

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearAllFilters = () => {
    setSelectedShopName([]);
    setSelectedSizeGroups([]);
    setSelectedGroupedTypes([]);
    setSelectedTopLevelCategories([]);
    setSelectedGenderAges([]);
    setOnSaleOnly(false);
    setSelectedPriceRange([...PRICE_RANGE]);
    setSearchQuery('');
    navigate('/', { replace: true });
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================
  
  const sortOptions = [
    { value: 'discount_desc', label: 'Best Discount' },
    { value: 'price_asc', label: 'Price: Low to High' },
    { value: 'price_desc', label: 'Price: High to Low' },
    { value: 'newest', label: 'Newest First' }
  ];

  const activeFilterCount = [
    selectedShopName.length > 0,
    selectedSizeGroups.length > 0,
    selectedGroupedTypes.length > 0,
    selectedTopLevelCategories.length > 0,
    selectedGenderAges.length > 0,
    onSaleOnly,
    selectedPriceRange[0] !== PRICE_RANGE[0] || selectedPriceRange[1] !== PRICE_RANGE[1]
  ].filter(Boolean).length;

  const shopOptions = shopList.map(shop => ({
    value: String(shop.id),
    label: shop.shop_name
  }));

  const sizeOptions = Array.from(new Set(allSizeData.map(s => s.size_group)))
    .filter(Boolean)
    .sort()
    .map(sg => ({ value: sg, label: sg }));

  const typeOptions = Array.from(new Set(allGroupedTypes.map(t => t.grouped_product_type)))
    .filter(Boolean)
    .sort()
    .map(t => ({ value: t, label: t }));

  const categoryOptions = Array.from(new Set(allTopLevelCategories.map(c => c.top_level_category)))
    .filter(Boolean)
    .sort()
    .map(c => ({ value: c, label: c }));

  const genderOptions = Array.from(new Set(allGenderAges.map(g => g.gender_age)))
    .filter(Boolean)
    .sort()
    .map(g => ({ value: g, label: g }));

  const isFetchingEmpty = loading && products.length === 0 && !initialLoad;

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />
      
      {/* Filter changing indicator */}
      {isFilterChanging && (
        <div className="fixed top-20 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
          <div className="flex items-center gap-2">
            <AsyncLucideIcon name="Loader2" className="animate-spin h-4 w-4" />
            <span className="text-sm font-medium">Updating results...</span>
          </div>
        </div>
      )}

      <div className="mx-auto px-4 py-6 sm:px-6 lg:px-8 max-w-screen-2xl">
        {/* Search Bar */}
        <div className="mb-6">
          <form onSubmit={handleSearchSubmit} className="relative max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full px-4 py-3 pr-24 text-sm border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label="Clear search"
                  >
                    <AsyncLucideIcon name="X" className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="p-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-md transition-colors"
                  aria-label="Search"
                >
                  <AsyncLucideIcon name="Search" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filters Sidebar */}
          <div className="w-full lg:w-64 flex-shrink-0">
            <div className="lg:sticky lg:top-6">
              {/* Mobile Filter Toggle */}
              <div className="lg:hidden mb-4">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  aria-expanded={showFilters}
                  aria-label="Toggle filter panel"
                  aria-controls="filter-panel"
                >
                  <div className="flex items-center gap-2">
                    <AsyncLucideIcon name="Filter" className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                    </span>
                  </div>
                  <AsyncLucideIcon 
                    name={showFilters ? "ChevronUp" : "ChevronDown"} 
                    className="h-5 w-5 text-gray-600 dark:text-gray-400" 
                  />
                </button>
              </div>

              {/* Filter Panel */}
              <div
                id="filter-panel"
                className={`${showFilters ? 'block' : 'hidden'} lg:block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4 space-y-4`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h3>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={handleClearAllFilters}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Filter Dropdowns */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Shop
                    </label>
                    <MultiSelectDropdown
                      options={shopOptions}
                      selected={selectedShopName}
                      onChange={setSelectedShopName}
                      placeholder="All shops"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Size
                    </label>
                    <MultiSelectDropdown
                      options={sizeOptions}
                      selected={selectedSizeGroups}
                      onChange={setSelectedSizeGroups}
                      placeholder="All sizes"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Type
                    </label>
                    <MultiSelectDropdown
                      options={typeOptions}
                      selected={selectedGroupedTypes}
                      onChange={setSelectedGroupedTypes}
                      placeholder="All types"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Category
                    </label>
                    <MultiSelectDropdown
                      options={categoryOptions}
                      selected={selectedTopLevelCategories}
                      onChange={setSelectedTopLevelCategories}
                      placeholder="All categories"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Gender/Age
                    </label>
                    <MultiSelectDropdown
                      options={genderOptions}
                      selected={selectedGenderAges}
                      onChange={setSelectedGenderAges}
                      placeholder="All"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Price Range
                    </label>
                    <TransformSlider
                      min={ABS_MIN_PRICE}
                      max={ABS_MAX_PRICE}
                      value={selectedPriceRange}
                      onChange={setSelectedPriceRange}
                      formatLabel={(val) => `£${val}`}
                    />
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onSaleOnly}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setOnSaleOnly(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">On sale only</span>
                    </label>
                  </div>
                </div>

                {/* Active Filters Pills */}
                {activeFilterCount > 0 && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Active filters:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedShopName.length > 0 && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                          Shops ({selectedShopName.length})
                          <button onClick={() => setSelectedShopName([])} className="ml-0.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
                            <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                      )}
                      {selectedSizeGroups.length > 0 && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                          Sizes ({selectedSizeGroups.length})
                          <button onClick={() => setSelectedSizeGroups([])} className="ml-0.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
                            <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                      )}
                      {selectedGroupedTypes.length > 0 && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                          Types ({selectedGroupedTypes.length})
                          <button onClick={() => setSelectedGroupedTypes([])} className="ml-0.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
                            <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                      )}
                      {selectedTopLevelCategories.length > 0 && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                          Categories ({selectedTopLevelCategories.length})
                          <button onClick={() => setSelectedTopLevelCategories([])} className="ml-0.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
                            <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                      )}
                      {selectedGenderAges.length > 0 && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                          Gender/Age ({selectedGenderAges.length})
                          <button onClick={() => setSelectedGenderAges([])} className="ml-0.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
                            <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                      )}
                      {(selectedPriceRange[0] !== PRICE_RANGE[0] || selectedPriceRange[1] !== PRICE_RANGE[1]) && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                          £{selectedPriceRange[0]} - £{selectedPriceRange[1]}
                          <button onClick={() => setSelectedPriceRange([...PRICE_RANGE])} className="ml-0.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
                            <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                      )}
                      {onSaleOnly && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded text-xs">
                          On Sale
                          <button onClick={() => setOnSaleOnly(false)} className="ml-0.5 text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-200">
                            <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1">
            <div className="mb-3 flex items-center justify-end sm:mb-4">
              <div className="w-40 sm:w-48">
                <SingleSelectDropdown 
                  options={sortOptions} 
                  selected={sortOrder} 
                  onChange={handleSortChange} 
                  placeholder="Sort by" 
                />
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AsyncLucideIcon name="AlertCircle" className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-red-700 dark:text-red-300 text-sm font-medium">Failed to load products</p>
                    <p className="text-red-600 dark:text-red-400 text-sm mt-1">Please check your connection and try again.</p>
                    <button 
                      onClick={() => { 
                        setError(null); 
                        setPage(0); 
                        setProducts([]); 
                        setInitialLoad(true); 
                      }} 
                      className="mt-3 text-red-600 dark:text-red-400 hover:underline text-sm font-medium"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Products Grid Container */}
            <div className="relative min-h-[400px]">
              {/* Accessibility - Live region for screen readers */}
              <div role="status" aria-live="polite" className="sr-only">
                {loading && "Loading products"}
                {!loading && products.length > 0 && `Showing ${products.length} products`}
                {!loading && products.length === 0 && "No products found"}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-grid-container>
                {initialLoad ? (
                  <ProductGridSkeleton count={10} />
                ) : isFetchingEmpty ? (
                  <div className="col-span-full flex flex-col items-center justify-center min-h-[200px]">
                    <AsyncLucideIcon name="Loader2" className="animate-spin h-8 w-8 text-gray-600 dark:text-gray-300 mb-3" />
                    <p className="text-gray-900 dark:text-gray-100 text-sm">Loading products…</p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center min-h-[200px] py-8">
                    <AsyncLucideIcon name="Search" className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
                    <p className="text-gray-900 dark:text-gray-100 text-sm font-medium">No products found</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Try adjusting your filters or search term</p>
                    <button 
                      onClick={handleClearAllFilters} 
                      className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      Clear all filters
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

              {/* Loading indicator while auto-loading */}
              {loading && page > 0 && !showLoadMoreButton && (
                <div className="flex justify-center py-8">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg">
                    <AsyncLucideIcon name="Loader2" className="animate-spin h-6 w-6 text-gray-600 dark:text-gray-300" />
                  </div>
                </div>
              )}

              {/* Load More Button */}
              {hasMore && !loading && showLoadMoreButton && products.length > 0 && (
                <div className="text-center py-8">
                  <button
                    onClick={handleLoadMoreClick}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <AsyncLucideIcon name="ChevronDown" className="h-4 w-4" />
                    Load More Products
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                    Showing {products.length} products
                  </p>
                </div>
              )}
              
              {/* Loading state for Load More button */}
              {hasMore && loading && showLoadMoreButton && products.length > 0 && (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg border-2 border-gray-200 dark:border-gray-700">
                    <AsyncLucideIcon name="Loader2" className="animate-spin h-4 w-4" />
                    Loading more...
                  </div>
                </div>
              )}

              {/* Infinite scroll trigger element */}
              {!showLoadMoreButton && hasMore && autoLoadCountRef.current < MAX_AUTO_LOADS && (
                <div ref={observerRef} className="h-20" />
              )}

              {/* End of results */}
              {!hasMore && products.length > 0 && (
                <div className="text-center py-8 border-t border-gray-200 dark:border-gray-800">
                  <div className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm mb-3">
                    <AsyncLucideIcon name="CheckCircle" className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <span>You've viewed all {products.length} products</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                    <button
                      onClick={handleBackToTop}
                      className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium border border-blue-600 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <AsyncLucideIcon name="ArrowUp" className="h-4 w-4" />
                      Back to top
                    </button>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={handleClearAllFilters}
                        className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <AsyncLucideIcon name="X" className="h-4 w-4" />
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-12 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-screen-2xl">
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              © {new Date().getFullYear()} Product Comparison. All rights reserved.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              Compare prices and find the best deals from top retailers
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// SKELETON COMPONENT
// ============================================================================

function ProductGridSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="bg-gray-200 dark:bg-gray-800 rounded-lg aspect-square mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
        </div>
      ))}
    </>
  );
}
