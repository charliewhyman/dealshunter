import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState, useMemo, startTransition } from 'react';
import { ProductWithDetails } from '../types';
import { apiClient } from '../lib/api-client';

import AsyncLucideIcon from '../components/AsyncLucideIcon';
import { ProductCard } from '../components/ProductCard';
import { Header } from '../components/Header';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { MultiSelectDropdown, SingleSelectDropdown } from '../components/Dropdowns';
import TransformSlider from '../components/TransformSlider';
import { CategoryConfig } from '../data/categories';

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
const REGULAR_LOAD_TIMEOUT_MS = 30000;
const MAX_CACHE_ENTRIES = 10;
const FILTER_OPTIONS_CACHE_KEY = 'filter_options_cache';
const FILTER_OPTIONS_TTL = 24 * 60 * 60 * 1000; // 24 hours

type SortOrder = 'price_asc' | 'price_desc' | 'discount_desc';

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

export function HomePage({ categoryConfig }: { categoryConfig?: CategoryConfig }) {
  // ============================================================================
  // STATE - Core
  // ============================================================================
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
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
  const [allSizeData, setAllSizeData] = useState<{size_group: string | null}[]>([]);
  const [allGroupedTypes, setAllGroupedTypes] = useState<Array<{grouped_product_type: string | null}>>([]);
  const [allTopLevelCategories, setAllTopLevelCategories] = useState<Array<{top_level_category: string | null}>>([]);
  const [allGenderAges, setAllGenderAges] = useState<Array<{gender_age: string | null}>>([]);

  // ============================================================================
  // STATE - User Selections (with localStorage)
  // ============================================================================
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

  const [searchQuery, setSearchQuery] = useState<string>(() => {
    if (categoryConfig?.filterDefaults?.query) return categoryConfig.filterDefaults.query;
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
    if (categoryConfig?.filterDefaults?.selectedGroupedTypes) return categoryConfig.filterDefaults.selectedGroupedTypes;
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
    if (categoryConfig?.filterDefaults?.selectedTopLevelCategories) return categoryConfig.filterDefaults.selectedTopLevelCategories;
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
    if (categoryConfig?.filterDefaults?.selectedGenderAges) return categoryConfig.filterDefaults.selectedGenderAges;
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

  // Update price range constants
  const ABS_MIN_PRICE = 0;
  const ABS_MAX_PRICE = 500; 
  
  const PRICE_RANGE = useMemo<[number, number]>(() => [15, 200], []); 
  
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
  // PRICE RANGE INPUT HANDLERS
  // ============================================================================
  
  const handleMinPriceChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= ABS_MIN_PRICE && value <= ABS_MAX_PRICE) {
      const newMin = Math.min(value, selectedPriceRange[1]);
      setSelectedPriceRange([newMin, selectedPriceRange[1]]);
    }
  }, [selectedPriceRange]);

  const handleMaxPriceChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= ABS_MIN_PRICE && value <= ABS_MAX_PRICE) {
      const newMax = Math.max(value, selectedPriceRange[0]);
      setSelectedPriceRange([selectedPriceRange[0], newMax]);
    }
  }, [selectedPriceRange]);

  const handlePriceInputBlur = useCallback(() => {
    // Ensure min <= max
    if (selectedPriceRange[0] > selectedPriceRange[1]) {
      setSelectedPriceRange([selectedPriceRange[1], selectedPriceRange[1]]);
    }
  }, [selectedPriceRange]);

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
  }, [searchParams]);

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
    
    const pricingMap: Record<string, {variantPrice: number | null; compareAtPrice: number | null;}> = {};
    
    try {
      const prices = await apiClient.fetchPricing(idsToFetch);

      for (const row of prices) {
        const pid = String(row.product_id);
        const price = row.price != null ? Number(row.price) : null;
        const compare = row.compare_at_price != null ? Number(row.compare_at_price) : null;
        if (!pricingMap[pid]) pricingMap[pid] = { variantPrice: price, compareAtPrice: compare };
        else {
          const existing = pricingMap[pid];
          if (price !== null && (existing.variantPrice === null || price < existing.variantPrice)) {
            existing.variantPrice = price;
            existing.compareAtPrice = compare ?? existing.compareAtPrice;
          }
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
  // PRICING INTERSECTION OBSERVER
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
  }, [fetchPricingDebounced]);

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



  // ============================================================================
  // MAIN FETCH FUNCTION
  // ============================================================================
  
  const fetchFilteredProducts = useCallback(async (
    filters: FilterOptions,
    offset: number,
    sortOrder: SortOrder,
    isFilterChange: boolean = false
  ) => {
    const requestKey = `${JSON.stringify(filters)}-${offset}-${sortOrder}`;
    
    if (!isFilterChange && inFlightRequestsRef.current.has(requestKey)) {
      return;
    }
    
    inFlightRequestsRef.current.add(requestKey);
    
    if (isFilterChange) {
      autoLoadCountRef.current = 0;
      setShowLoadMoreButton(false);
      
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }
      currentRequestRef.current = null;
      
      const keysToDelete = Object.keys(prefetchCacheRef.current).filter(key => 
        key.startsWith(`${JSON.stringify(filters)}-`)
      );
      keysToDelete.forEach(key => {
        delete prefetchCacheRef.current[key];
      });
    }
    
    if (!isFilterChange) {
      const cached = prefetchCacheRef.current[requestKey];
      if (cached) {
        const hasMoreData = cached.data.length > ITEMS_PER_PAGE;
        const productsToShow = hasMoreData ? cached.data.slice(0, ITEMS_PER_PAGE) : cached.data;
                
        startTransition(() => {
          setProducts(prev => isFilterChange ? productsToShow : [...prev, ...productsToShow]);
          setHasMore(hasMoreData);
          setInitialLoad(false);
          setError(null);
          setLoading(false);
          setIsFilterChanging(false);
        });
        
        isFetchingRef.current = false;
        observerLockRef.current = false;
        inFlightRequestsRef.current.delete(requestKey);
        
        canLoadMoreRef.current = false;
        setTimeout(() => {
          canLoadMoreRef.current = true;
        }, LOAD_COOLDOWN);
        
        if (!isFilterChange) {
          autoLoadCountRef.current += 1;
          const newCount = autoLoadCountRef.current;
          
          startTransition(() => {
            if (newCount >= MAX_AUTO_LOADS) {
              setShowLoadMoreButton(true);
            }
          });
        }
        
        // Prefetch next page
        if (hasMoreData && autoLoadCountRef.current < MAX_AUTO_LOADS) {
          scheduleIdle(async () => {
            const nextOffset = offset + ITEMS_PER_PAGE;
            const nextKey = `${JSON.stringify(filters)}-${nextOffset}-${sortOrder}`;
            if (!prefetchCacheRef.current[nextKey]) {
              try {
                // Prefetch next page: default limit is 31 in api client which is essentially page + 1
                const nextData = await apiClient.fetchProducts(filters, nextOffset, sortOrder);
                
                if (Array.isArray(nextData)) {
                  prefetchCacheRef.current[nextKey] = { data: nextData as unknown as ProductWithDetails[] };
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
    }
    
    isFetchingRef.current = true;
    
    if (isFilterChange) {
      setLoading(true);
      setIsFilterChanging(true);
    }
    
    try {
      const controller = new AbortController();
      currentRequestRef.current = controller;
      
      const timeoutId = setTimeout(() => controller.abort(), REGULAR_LOAD_TIMEOUT_MS);
      
      
      // Call API
      const data = await apiClient.fetchProducts(filters, offset, sortOrder);
      
      clearTimeout(timeoutId);
      
      const newData = (data as unknown as ProductWithDetails[]) || [];
      const hasMoreData = newData.length > ITEMS_PER_PAGE;
      const productsToShow = hasMoreData ? newData.slice(0, ITEMS_PER_PAGE) : newData;

      if (!isFilterChange || productsToShow.length > 0) {
        prefetchCacheRef.current[requestKey] = { data: newData };
      }
      
      const cacheKeys = Object.keys(prefetchCacheRef.current);
      if (cacheKeys.length > MAX_CACHE_ENTRIES) {
        const toRemove = cacheKeys.slice(0, cacheKeys.length - MAX_CACHE_ENTRIES);
        for (const key of toRemove) {
          delete prefetchCacheRef.current[key];
        }
      }
      
      startTransition(() => {
        if (isFilterChange) {
          setProducts(productsToShow);
        } else {
          setProducts(prev => [...prev, ...productsToShow]);
        }
        setHasMore(hasMoreData);
        setInitialLoad(false);
        setError(null);
        setLoading(false);
        setIsFilterChanging(false);
      });
      
      if (productsToShow.length > 0) {
        const ids = productsToShow.map(p => p.id).filter(Boolean);
        scheduleIdle(() => fetchBatchPricingFor(ids));
      }
      
      if (!isFilterChange) {
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
          const nextOffset = offset + ITEMS_PER_PAGE;
          const nextKey = `${JSON.stringify(filters)}-${nextOffset}-${sortOrder}`;
          if (!prefetchCacheRef.current[nextKey]) {
            try {
              const nextData = await apiClient.fetchProducts(filters, nextOffset, sortOrder);
              
              if (Array.isArray(nextData)) {
                prefetchCacheRef.current[nextKey] = { data: nextData as unknown as ProductWithDetails[] };
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
      const maybeErr = err as { name?: string; message?: string; code?: string };
      
      if (maybeErr.name === 'AbortError' || maybeErr.message?.includes('AbortError')) {
        console.warn('Request was aborted:', maybeErr);
        return;
      }
      
      console.error('Fetch error in fetchFilteredProducts:', err);
      
      let errorMessage = 'Failed to load products. Please try again.';
      if (maybeErr.code === '57014') {
        errorMessage = 'Request timed out. The server might be experiencing high load. Please try again.';
      }
      
      startTransition(() => {
        setError(errorMessage);
        setHasMore(false);
        setInitialLoad(false);
        setLoading(false);
        setIsFilterChanging(false);
      });
    } finally {
      if (!currentRequestRef.current?.signal.aborted) {
        isFetchingRef.current = false;
        observerLockRef.current = false;
        inFlightRequestsRef.current.delete(requestKey);
      }
    }
  }, [scheduleIdle, fetchBatchPricingFor]);

  // ============================================================================
  // EFFECT - Handle Category Page Navigation / Reset
  // ============================================================================
  const [isCategoryInitialized, setIsCategoryInitialized] = useState(false);

  useEffect(() => {
    if (categoryConfig) {
      const defaults = categoryConfig.filterDefaults;
      
      // Explicitly reset filters when category SLUG changes
      setSelectedTopLevelCategories(defaults.selectedTopLevelCategories || []);
      setSelectedGenderAges(defaults.selectedGenderAges || []);
      setSelectedGroupedTypes(defaults.selectedGroupedTypes || []);
      setSelectedSizeGroups([]); 
      setSelectedShopName([]); 
      setSearchQuery(defaults.query || ''); 
      setSelectedPriceRange([0, 500]); 
      
      setIsCategoryInitialized(true);
    } else {
      setIsCategoryInitialized(true);
    }
  }, [categoryConfig?.slug]);

  // ============================================================================
  // PRE-WARM CONNECTION ON APP START
  // ============================================================================

  useEffect(() => {
    // Pre-warm Neon connection on component mount
    // Connection pre-warming removed as we are now using HTTP API
    const prewarmConnection = async () => {
      // no-op
    };

    // Small delay to not block initial render
    const timer = setTimeout(() => {
      prewarmConnection();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  // Add index, follow meta tag (and other SEO tags for categories)
  useEffect(() => {
    const tags: HTMLElement[] = [];

    // Robots
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'index, follow';
    document.head.appendChild(metaRobots);
    tags.push(metaRobots);

    // Category SEO
    if (categoryConfig) {
      // Title
      const originalTitle = document.title;
      document.title = categoryConfig.title;

      // Meta Description
      let metaDesc = document.querySelector('meta[name="description"]');
      let originalDesc = metaDesc?.getAttribute('content') || '';
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
        tags.push(metaDesc as HTMLElement); // Mark for removal if we created it? Actually better not to remove existing description element, just revert content.
      }
      metaDesc.setAttribute('content', categoryConfig.metaDescription);

      // Canonical
      const linkCanonical = document.createElement('link');
      linkCanonical.rel = 'canonical';
      // Assuming slug matches URL path segment
      linkCanonical.href = `https://curatedcanada.ca/collections/${categoryConfig.slug}`;
      document.head.appendChild(linkCanonical);
      tags.push(linkCanonical);

      return () => {
        document.title = originalTitle;
        if (metaDesc) metaDesc.setAttribute('content', originalDesc);
        tags.forEach(t => {
          if (document.head.contains(t)) document.head.removeChild(t);
        });
      };
    } else {
      // Cleanup robots only if not category page logic (which handles cleanup above)
       return () => {
        tags.forEach(t => {
          if (document.head.contains(t)) document.head.removeChild(t);
        });
      };
    }
  }, [categoryConfig]);

  // ============================================================================
  // EFFECT - Redirect to Home if Category Filters Cleared
  // ============================================================================
  useEffect(() => {
    if (!categoryConfig || !categoryConfig.filterDefaults) return;
    
    // Prevent redirect if we are in the process of initializing defaults
    if (!isCategoryInitialized) return;

    // Check if we are still 'in' the category
    // Logic: If the category has defaults, at least one of them must be active.
    // Actually, user might want to clear specific filters, but if they clear EVERYTHING that defines the category, they should probably go home.
    
    // We only check the defaults that are arrays (the multi-selects).
    // If a default exists (e.g. selectedTopLevelCategories=['Footwear']), 
    // we require that the current selection overlaps with it or contains it?
    // No, usually "Footwear" is pre-selected. If user unchecks "Footwear", selectedTopLevelCategories becomes empty.
    
    // So: if filterDefaults has a key, and the corresponding state is empty, redirect.
    
    const defaults = categoryConfig.filterDefaults;
    let shouldRedirect = false;

    if (defaults.selectedTopLevelCategories && defaults.selectedTopLevelCategories.length > 0) {
      if (selectedTopLevelCategories.length === 0) shouldRedirect = true;
    }
    
    // Sometimes gender is the defining feature (Women's Clothing)
    if (defaults.selectedGenderAges && defaults.selectedGenderAges.length > 0) {
       // Ideally we check if "Women" is still selected for Women's Clothing.
       // But user might filter for "Women" + "Sales". If they remove "Women", they are seeing sales of Men's too?
       // Yes.
       if (selectedGenderAges.length === 0) shouldRedirect = true;
    }

    if (shouldRedirect) {
       // Use replace to avoid back-button loops
       navigate('/', { replace: true });
    }

  }, [
    categoryConfig, 
    selectedTopLevelCategories, 
    selectedGenderAges, 
    // We focus on the "Big" filters. Types can be cleared without leaving the category (e.g. searching).
    navigate
  ]);

  // ============================================================================
  // FETCH INITIAL FILTER OPTIONS
  // ============================================================================
  
  useEffect(() => {
  let cancelled = false;

  async function fetchInitialData() {
    try {
      // ==============================
      // 1. Try localStorage cache
      // ==============================
      const cached = localStorage.getItem(FILTER_OPTIONS_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < FILTER_OPTIONS_TTL) {
            if (cancelled) return;

            setShopList(parsed.shops ?? []);
            setAllSizeData(parsed.sizes ?? []);
            setAllGroupedTypes(parsed.types ?? []);
            setAllTopLevelCategories(parsed.categories ?? []);
            setAllGenderAges(parsed.genders ?? []);
            return;
          }
        } catch (err) {
          console.warn('Filter cache invalid, refetching');
        }
      }

      // ==============================
      // 2. Fetch fresh data
      // ==============================
      
      const [
        shopsResult,
        sizesResult,
        typesResult,
        categoriesResult,
        gendersResult
      ] = await Promise.all([
        // ------------------------------
        // Shops (real table)
        // ------------------------------
        fetchWithCache<{ id: number; shop_name: string }>('shops', async () => {
          const data = await apiClient.fetchShops();

          // Filter out any shops with null names to satisfy the type definition
          return (data ?? [])
            .filter(s => s.shop_name !== null)
            .map(s => ({ id: Number(s.id), shop_name: s.shop_name! }));
        }),

        // ------------------------------
        // Sizes (View)
        // ------------------------------
        fetchWithCache<{ size_group: string | null }>('sizes', async () => {
          const data = await apiClient.fetchSizes();
          return data ?? [];
        }),

        // ------------------------------
        // Grouped types (View)
        // ------------------------------
        fetchWithCache<{ grouped_product_type: string | null }>('types', async () => {
          const data = await apiClient.fetchTypes();
          return data ?? [];
        }),

        // ------------------------------
        // Top-level categories (View)
        // ------------------------------
        fetchWithCache<{ top_level_category: string | null }>('categories', async () => {
          const data = await apiClient.fetchCategories();
          return data ?? [];
        }),

        // ------------------------------
        // Gender / age (View)
        // ------------------------------
        fetchWithCache<{ gender_age: string | null }>('genders', async () => {
          const data = await apiClient.fetchGenders();
          return data ?? [];
        })
      ]);

      if (cancelled) return;

      // ==============================
      // 3. Update state
      // ==============================
      setShopList(shopsResult);
      setAllSizeData(sizesResult);
      setAllGroupedTypes(typesResult);
      setAllTopLevelCategories(categoriesResult);
      setAllGenderAges(gendersResult);

      // ==============================
      // 4. Cache results
      // ==============================
      safeLocalStorageSet(
        FILTER_OPTIONS_CACHE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          shops: shopsResult,
          sizes: sizesResult,
          types: typesResult,
          categories: categoriesResult,
          genders: gendersResult
        })
      );
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }

  fetchInitialData();

  return () => {
    cancelled = true;
  };
}, [fetchWithCache]);

  // ============================================================================
  // EFFECT - Monitor Filter Changes and Trigger Fetch
  // ============================================================================

  const currentFilters: FilterOptions = useMemo(() => ({
    selectedShopName,
    selectedSizeGroups,
    selectedGroupedTypes,
    selectedTopLevelCategories,
    selectedGenderAges,
    onSaleOnly,
    searchQuery,
    selectedPriceRange
  }), [
    selectedShopName,
    selectedSizeGroups,
    selectedGroupedTypes,
    selectedTopLevelCategories,
    selectedGenderAges,
    onSaleOnly,
    searchQuery,
    selectedPriceRange
  ]);

  useEffect(() => {
    // Include sortOrder in the filter key
    const currentFilterKey = JSON.stringify({ ...currentFilters, sortOrder });
    
    // Skip if this is the same filter key (no actual change)
    if (prevFilterKeyRef.current === currentFilterKey) {
      return;
    }
    
    // Reset everything for new filter/sort
    startTransition(() => {
      setProducts([]);
      setShowLoadMoreButton(false);
      setIsFilterChanging(true);
      setHasMore(true);
      setError(null);
      setInitialLoad(false);
      setLoading(true);
    });
    
    // Cancel any ongoing request
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
    }
    
    // Reset counters and cache
    autoLoadCountRef.current = 0;
    inFlightRequestsRef.current.clear();
    
    // Store current filter key
    prevFilterKeyRef.current = currentFilterKey;
    
    // Fetch first page
    fetchFilteredProducts(currentFilters, 0, sortOrder, true);
    
  }, [currentFilters, sortOrder, fetchFilteredProducts]);

  // ============================================================================
  // INFINITE SCROLL OBSERVER
  // ============================================================================
  
  useEffect(() => {
    const target = observerRef.current;
    
    if (!target || !hasMore || loading || showLoadMoreButton || isFilterChanging || products.length === 0) {
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
        
        // Load next page
        fetchFilteredProducts(currentFilters, products.length, sortOrder, false);
        
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
  }, [hasMore, loading, showLoadMoreButton, isFilterChanging, products.length, sortOrder, currentFilters, fetchFilteredProducts]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    
    if (trimmedQuery) {
      navigate(`/?search=${encodeURIComponent(trimmedQuery)}`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleSortChange = (value: string) => {
    setSortOrder(value as SortOrder);
  };

  const handleLoadMoreClick = () => {
    if (!loading && hasMore && products.length > 0 && !isFilterChanging) {
      fetchFilteredProducts(currentFilters, products.length, sortOrder, false);
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

  // Fixed code (preserve database order)
  const sizeOptions = allSizeData
      .map(item => item.size_group)
      .filter((s): s is string => !!s)
      .filter((value, index, self) => self.indexOf(value) === index) // Remove duplicates
      .map(sg => ({ value: sg, label: sg }));

  const typeOptions = Array.from(new Set(allGroupedTypes.map(t => t.grouped_product_type)))
    .filter((t): t is string => !!t)
    .sort()
    .map(t => ({ value: t, label: t }));

  const categoryOptions = Array.from(new Set(allTopLevelCategories.map(c => c.top_level_category)))
    .filter((c): c is string => !!c)
    .sort()
    .map(c => ({ value: c, label: c }));

  const genderOptions = Array.from(new Set(allGenderAges.map(g => g.gender_age)))
    .filter((g): g is string => !!g)
    .sort()
    .map(g => ({ value: g, label: g }));

  const isFetchingEmpty = loading && products.length === 0 && !initialLoad;

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-['Inter',sans-serif]">
      <Header 
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      <div className="mx-auto px-4 pt-24 pb-6 sm:px-6 lg:px-8 max-w-screen-2xl">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filters Sidebar */}
          <div className="w-full lg:w-96 flex-shrink-0">
            <div className="lg:sticky lg:top-24">
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

                  {/* Price Range Filter - Updated */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Price Range
                    </label>
                    <div className="space-y-3">
                      {/* Price Input Boxes */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <label className="sr-only">Minimum price</label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                              $
                            </div>
                            <input
                              type="number"
                              min={ABS_MIN_PRICE}
                              max={ABS_MAX_PRICE}
                              step="1"
                              value={selectedPriceRange[0]}
                              onChange={handleMinPriceChange}
                              onBlur={handlePriceInputBlur}
                              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              placeholder="Min"
                              aria-label="Minimum price"
                            />
                          </div>
                        </div>
                        <span className="text-gray-500 dark:text-gray-400">to</span>
                        <div className="flex-1">
                          <label className="sr-only">Maximum price</label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                              $
                            </div>
                            <input
                              type="number"
                              min={ABS_MIN_PRICE}
                              max={ABS_MAX_PRICE}
                              step="1"
                              value={selectedPriceRange[1]}
                              onChange={handleMaxPriceChange}
                              onBlur={handlePriceInputBlur}
                              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              placeholder="Max"
                              aria-label="Maximum price"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Slider */}
                      <TransformSlider
                        min={ABS_MIN_PRICE}
                        max={ABS_MAX_PRICE}
                        value={selectedPriceRange}
                        onFinalChange={(values) => {
                          if (Array.isArray(values) && values.length === 2) {
                            setSelectedPriceRange([values[0], values[1]]);
                          }
                        }}
                      />
                      
                      {/* Price Range Labels */}
                      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>${ABS_MIN_PRICE}</span>
                        <span>${ABS_MAX_PRICE}</span>
                      </div>
                    </div>
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
                          ${selectedPriceRange[0]} - ${selectedPriceRange[1]}
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

              {/* Sidebar Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800">
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
                  <Link to="/about" className="hover:text-gray-900 dark:hover:text-gray-200">About</Link>
                  <Link to="/contact" className="hover:text-gray-900 dark:hover:text-gray-200">Contact</Link>
                  <Link to="/privacy" className="hover:text-gray-900 dark:hover:text-gray-200">Privacy</Link>
                  <Link to="/terms" className="hover:text-gray-900 dark:hover:text-gray-200">Terms</Link>
                </div>
                <p className="mt-4 text-xs text-gray-400 dark:text-gray-600">
                  © {new Date().getFullYear()} Curated Canada
                </p>
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1">
            {/* Category Header (H1 + Intro) */}
            {categoryConfig && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                  {categoryConfig.h1}
                </h1>
                <div className="text-gray-600 dark:text-gray-300">
                  {typeof categoryConfig.introText === 'function' 
                    ? categoryConfig.introText({
                        setGroupedTypes: setSelectedGroupedTypes,
                        setTopLevelCategories: setSelectedTopLevelCategories,
                        setGenderAges: setSelectedGenderAges,
                        setSearchQuery: setSearchQuery
                      }) 
                    : (categoryConfig.introText as React.ReactNode)}
                </div>
                {/* Stats */}
                {!loading && products.length > 0 && (
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    Currently showing {products.length} {products.length === 1 ? 'item' : 'items'} 
                    {selectedPriceRange[0] !== 0 || selectedPriceRange[1] !== 500 ? ` from $${selectedPriceRange[0]} to $${selectedPriceRange[1]}` : ''}.
                  </p>
                )}
              </div>
            )}

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
                    <p className="text-red-700 dark:text-red-300 text-sm font-medium">{error}</p>
                    <p className="text-red-600 dark:text-red-400 text-sm mt-1">
                      {error.includes('timed out') 
                        ? 'The server might be experiencing high load. Please try again.' 
                        : 'Please check your connection and try again.'}
                    </p>
                    <button 
                      onClick={() => { 
                        setError(null); 
                        setProducts([]); 
                        setInitialLoad(true); 
                        fetchFilteredProducts(
                          { 
                            selectedShopName, 
                            selectedSizeGroups, 
                            selectedGroupedTypes, 
                            selectedTopLevelCategories, 
                            selectedGenderAges, 
                            onSaleOnly, 
                            searchQuery, 
                            selectedPriceRange 
                          },
                          0,
                          sortOrder,
                          true
                        );
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
                ) : products.length === 0 && !loading ? (
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
                            isLcp={index < LCP_PRELOAD_COUNT}
                          />
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Loading indicator while auto-loading */}
              {loading && products.length > 0 && !showLoadMoreButton && !isFilterChanging && (
                <div className="flex justify-center py-8">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg">
                    <AsyncLucideIcon name="Loader2" className="animate-spin h-6 w-6 text-gray-600 dark:text-gray-300" />
                  </div>
                </div>
              )}

              {/* Load More Button */}
              {hasMore && !loading && showLoadMoreButton && products.length > 0 && !isFilterChanging && (
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
              {hasMore && loading && showLoadMoreButton && products.length > 0 && !isFilterChanging && (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-medium rounded-lg border-2 border-gray-200 dark:border-gray-700">
                    <AsyncLucideIcon name="Loader2" className="animate-spin h-4 w-4" />
                    Loading more...
                  </div>
                </div>
              )}

              {/* Infinite scroll trigger element */}
              {!showLoadMoreButton && hasMore && autoLoadCountRef.current < MAX_AUTO_LOADS && !isFilterChanging && products.length > 0 && (
                <div ref={observerRef} className="h-20" />
              )}

              {/* End of results */}
              {!hasMore && products.length > 0 && !isFilterChanging && (
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
            
            {/* Category Bottom Content */}
            {categoryConfig && categoryConfig.bottomContent && (
              <div className="mt-16">
                 {categoryConfig.bottomContent}
              </div>
            )}
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
