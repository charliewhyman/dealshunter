import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState, useMemo, startTransition } from 'react';
import { ProductWithDetails } from '../types';
import { getSupabase } from '../lib/supabase';
import AsyncLucideIcon from '../components/AsyncLucideIcon';
import { ProductCard } from '../components/ProductCard';
import { Header } from '../components/Header';
import { useLocation, useNavigate } from 'react-router-dom';

// Small local debounce utility to avoid importing the full lodash bundle 
function createDebounced<Args extends unknown[]>(fn: (...args: Args) => void, wait: number): ((...args: Args) => void) & { cancel?: () => void } {
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

import { MultiSelectDropdown, SingleSelectDropdown } from '../components/Dropdowns';
import TransformSlider from '../components/TransformSlider';
const ITEMS_PER_PAGE = 10;
const INITIAL_RENDER_COUNT = 4;
const LCP_PRELOAD_COUNT = INITIAL_RENDER_COUNT;

type SortOrder = 'asc' | 'desc' | 'discount_desc';

export function HomePage() {
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopList, setShopList] = useState<Array<{id: number; shop_name: string}>>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    try {
      if (typeof window === 'undefined') return 'discount_desc';
      const stored = localStorage.getItem('sortOrder');
      if (stored === 'asc' || stored === 'desc' || stored === 'discount_desc') return stored as SortOrder;
    } catch {
      /* ignore */
    }
    return 'discount_desc';
  });
  const observerRef = useRef<HTMLDivElement | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    try {
      const fromUrl = new URLSearchParams(location.search).get('search');
      if (fromUrl != null) return fromUrl;
      if (typeof window !== 'undefined') {
        const fromStorage = localStorage.getItem('searchQuery');
        if (fromStorage) return fromStorage;
      }
    } catch {
      /* ignore */
    }
    return '';
  });
  const navigate = useNavigate();

  const [selectedShopName, setSelectedShopName] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedShopName');
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) return parsed as string[];
      if (parsed == null) return [];
      return [String(parsed)];
    } catch {
      return [];
    }
  });

  const [selectedGroupedTypes, setSelectedGroupedTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedGroupedTypes');
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) return parsed as string[];
      if (parsed == null) return [];
      return [String(parsed)];
    } catch {
      return [];
    }
  });

  const [selectedTopLevelCategories, setSelectedTopLevelCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedTopLevelCategories');
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) return parsed as string[];
      if (parsed == null) return [];
      return [String(parsed)];
    } catch {
      return [];
    }
  });

  const [selectedGenderAges, setSelectedGenderAges] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('selectedGenderAges');
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) return parsed as string[];
      if (parsed == null) return [];
      return [String(parsed)];
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

  const PRICE_RANGE = useMemo<[number, number]>(() => [15, 1000], []);
  const ABS_MIN_PRICE = 0;
  const ABS_MAX_PRICE = 100000;
  const [selectedPriceRange, setSelectedPriceRange] = useState<[number, number]>(() => {
    try {
      const savedRange = JSON.parse(localStorage.getItem('selectedPriceRange') || 'null');
      if (
        Array.isArray(savedRange) &&
        typeof savedRange[0] === 'number' &&
        typeof savedRange[1] === 'number' &&
        savedRange[0] <= savedRange[1] &&
        savedRange[0] >= ABS_MIN_PRICE &&
        savedRange[1] <= ABS_MAX_PRICE
      ) {
        return [savedRange[0], savedRange[1]] as [number, number];
      }
    } catch {
      // fall through to default
    }
    return [...PRICE_RANGE];
  });

  const [selectedSizeGroups, setSelectedSizeGroups] = useState<string[]>(
    (() => {
      try {
        const saved = localStorage.getItem('selectedSizeGroups');
        const parsed = saved ? JSON.parse(saved) : [];
        if (Array.isArray(parsed)) return parsed as string[];
        if (parsed == null) return [];
        return [String(parsed)];
      } catch {
        return [];
      }
    })()
  );

  const [productPricings, setProductPricings] = useState<Record<string, {variantPrice: number | null; compareAtPrice: number | null; offerPrice: number | null;}>>({});

  const scheduleIdle = useCallback((task: () => void) => {
    if (typeof window === 'undefined') {
      setTimeout(() => { try { task(); } catch (e) { void e; } }, 200);
      return;
    }

    const w = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number });
    if (w.requestIdleCallback) {
      try {
        w.requestIdleCallback(() => {
          try {
            task();
          } catch (e) { void e; }
        }, { timeout: 2000 });
        return;
      } catch {
        // fall through to timeout fallback
      }
    }

    setTimeout(() => { try { task(); } catch (e) { void e; } }, 200);
  }, []);

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pricedIdsRef = useRef<Set<string>>(new Set());
  const pendingRequestsRef = useRef<Map<string, Promise<void>>>(new Map());
  
  const isFetchingRef = useRef(false);
  const observerLockRef = useRef(false);
  
  const fetchBatchPricingFor = useCallback(async (ids: Array<number | string>) => {
    const uniqueIds = Array.from(new Set(ids.map(String))).filter(Boolean);
    if (uniqueIds.length === 0) return;
  
    const idsToFetch = uniqueIds.filter(id => !(id in productPricings));
    if (idsToFetch.length === 0) return;
  
    const supabase = getSupabase();
    const pricingMap: Record<string, {variantPrice: number | null; compareAtPrice: number | null; offerPrice: number | null;}> = {};
  
    try {
      // Convert string IDs to numbers for the RPC call
      const numericIds = idsToFetch.map(id => {
        const num = Number(id);
        return isNaN(num) ? 0 : num;
      }).filter(id => id > 0);
  
      if (numericIds.length === 0) return;
  
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_products_pricing', { 
        p_product_ids: numericIds
      });
  
      if (!rpcError && Array.isArray(rpcData)) {
        for (const row of rpcData) {
          const pid = String(row.product_id);
          const variantPrice = row.variant_price != null ? parseFloat(String(row.variant_price)) : null;
          const compareAtPrice = row.compare_at_price != null ? parseFloat(String(row.compare_at_price)) : null;
          const offerPrice = row.offer_price != null ? parseFloat(String(row.offer_price)) : null;
          pricingMap[pid] = { variantPrice, compareAtPrice, offerPrice };
        }
      }
    } catch (error) {
      console.error('Error fetching pricing:', error);
    }
  
    setProductPricings(prev => ({ ...prev, ...pricingMap }));
  }, [productPricings]);
  
  const fetchPricingDebounced = useRef(
    createDebounced((ids: string[]) => {
      if (ids.length > 0) {
        fetchBatchPricingFor(ids).catch(e => 
          console.error('Error fetching pricing', e)
        );
      }
    }, 300)
  ).current;
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
  
    const io = new IntersectionObserver(
      (entries) => {
        const idsToFetch: string[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).getAttribute('data-prod-id');
          if (!id) continue;
          if (pricedIdsRef.current.has(id)) continue;
          pricedIdsRef.current.add(id);
          idsToFetch.push(id);
        }
  
        if (idsToFetch.length > 0) {
          fetchPricingDebounced(idsToFetch);
        }
      },
      { rootMargin: '200px', threshold: 0.1 }
    );
  
    for (const el of cardRefs.current.values()) {
      try { io.observe(el); } catch { /* ignore */ }
    }
  
    return () => io.disconnect();
  }, [products, fetchBatchPricingFor, fetchPricingDebounced]);

  const [allSizeData, setAllSizeData] = useState<{size_group: string}[]>([]);
  const [allGroupedTypes, setAllGroupedTypes] = useState<Array<{grouped_product_type: string}>>([]);
  const [allTopLevelCategories, setAllTopLevelCategories] = useState<Array<{top_level_category: string}>>([]);
  const [allGenderAges, setAllGenderAges] = useState<Array<{gender_age: string}>>([]);

  const requestQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const prefetchCacheRef = useRef<Record<string, { key: string; data: ProductWithDetails[]; count: number | null }>>({});
  const totalCountRef = useRef<Record<string, number | null>>({});
  
  const filterCacheRef = useRef<Map<string, { data: unknown[]; timestamp: number }>>(new Map());
  const inflightFetchesRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000;

  const fetchWithCache = useCallback(async <T,>(
    key: string, 
    fetchFn: () => Promise<T[]>
  ): Promise<T[]> => {
    const cached = filterCacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as T[];
    }
    
    const inflight = inflightFetchesRef.current.get(key) as Promise<T[]> | undefined;
    if (inflight) {
      try {
        return await inflight;
      } catch {
        // fall through
      }
    }

    const promise = (async () => {
      const data = await fetchFn();
      filterCacheRef.current.set(key, { data: data as unknown[], timestamp: Date.now() });
      return data as T[];
    })();

    inflightFetchesRef.current.set(key, promise as Promise<unknown>);
    try {
      return await promise;
    } finally {
      inflightFetchesRef.current.delete(key);
    }
  }, [CACHE_TTL]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || requestQueueRef.current.length === 0) return;
    
    isProcessingRef.current = true;
    const task = requestQueueRef.current.shift();
    
    if (task) {
      try {
        await task();
      } catch (error) {
        console.error('Request queue task failed:', error);
      } finally {
        isProcessingRef.current = false;
        setTimeout(() => {
          if (requestQueueRef.current.length > 0) {
            processQueue();
          }
        }, 50);
      }
    }
  }, []);

  const enqueueRequest = useCallback((task: () => Promise<void>) => {
    requestQueueRef.current.push(task);
    processQueue();
  }, [processQueue]);

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

  interface FilterOptions {
    selectedShopName: string[];
    selectedSizeGroups: string[];
    selectedGroupedTypes: string[];
    selectedTopLevelCategories: string[];
    selectedGenderAges: string[];
    inStockOnly: boolean;
    onSaleOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
  }

  // Build RPC parameters from filters
  const buildRpcParams = useCallback((filters: FilterOptions, page: number, sortOrder: SortOrder) => {
    const shopIds = filters.selectedShopName
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const sizeGroups = filters.selectedSizeGroups
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const groupedTypes = filters.selectedGroupedTypes
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const topLevelCategories = filters.selectedTopLevelCategories
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const genderAges = filters.selectedGenderAges
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return {
      p_shop_ids: shopIds.length > 0 ? shopIds : [],
      p_size_groups: sizeGroups.length > 0 ? sizeGroups : [],
      p_grouped_types: groupedTypes.length > 0 ? groupedTypes : [],
      p_top_level_categories: topLevelCategories.length > 0 ? topLevelCategories : [],
      p_gender_ages: genderAges.length > 0 ? genderAges : [],
      p_in_stock_only: filters.inStockOnly,
      p_on_sale_only: filters.onSaleOnly,
      p_min_price: filters.selectedPriceRange[0],
      p_max_price: filters.selectedPriceRange[1],
      p_search_query: filters.searchQuery?.trim() || null,
      p_limit: ITEMS_PER_PAGE,
      p_offset: page * ITEMS_PER_PAGE,
      p_sort_order: sortOrder
    };
  }, []);

  const fetchFilteredProducts = useCallback(
    async (
      filters: FilterOptions,
      page: number,
      sortOrder: SortOrder,
      isFilterChange: boolean = false
    ) => {
      const TIMEOUT_MS = 10000;
      const requestKey = `${JSON.stringify(filters)}-${page}-${sortOrder}`;
      const filtersKey = `${JSON.stringify(filters)}-${sortOrder}`;

      // If filters changed, clear cache and existing products
      if (isFilterChange) {
        prefetchCacheRef.current = {};
        totalCountRef.current = {};
        startTransition(() => {
          setProducts([]);
        });
      }

      // FAST PATH: Use prefetch cache
      const cached = prefetchCacheRef.current[requestKey];
      if (cached) {
        if (cached.count != null) totalCountRef.current[filtersKey] = cached.count;
        startTransition(() => {
          setProducts(prev => (page === 0 || isFilterChange ? cached.data : mergeUniqueProducts(prev, cached.data)));
          const loadedItemsCount = (page + 1) * ITEMS_PER_PAGE;
          if (cached.count == null || cached.data.length === 0 || cached.data.length < ITEMS_PER_PAGE) {
            setHasMore(false);
          } else {
            setHasMore(loadedItemsCount < cached.count);
          }
        });

        setInitialLoad(false);
        setError(null);
        setLoading(false);
        isFetchingRef.current = false;
        observerLockRef.current = false;

        // Prefetch next page
        scheduleIdle(async () => {
          try {
            const nextPage = page + 1;
            const knownTotal = totalCountRef.current[filtersKey];
            if (typeof knownTotal === 'number' && nextPage * ITEMS_PER_PAGE >= knownTotal) return;

            const nextKey = `${JSON.stringify(filters)}-${nextPage}-${sortOrder}`;
            if (!prefetchCacheRef.current[nextKey]) {
              const supabase = getSupabase();
              const params = buildRpcParams(filters, nextPage, sortOrder);
              const { data: nextData, error: nextError } = await supabase.rpc('get_products_filtered', params);
              
              if (!nextError && Array.isArray(nextData)) {
                const count = nextData[0]?.total_count || null;
                prefetchCacheRef.current[nextKey] = { 
                  key: nextKey, 
                  data: nextData as ProductWithDetails[], 
                  count 
                };
                if (count != null) totalCountRef.current[filtersKey] = count;
                
                const ids = nextData.map(p => p.id).filter(Boolean);
                if (ids.length) fetchBatchPricingFor(ids);
              }
            }
          } catch {
            /* ignore prefetch failures */
          }
        });

        return;
      }

      // Prevent duplicate requests
      if (pendingRequestsRef.current.has(requestKey)) return;

      const requestPromise = new Promise<void>((resolve, reject) => {
        enqueueRequest(async () => {
          const controller = new AbortController();
          currentRequestRef.current = controller;
          
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
          isFetchingRef.current = true;
          setLoading(true);

          try {
            const supabase = getSupabase();
            const params = buildRpcParams(filters, page, sortOrder);
            
            const { data, error } = await supabase.rpc('get_products_filtered', params);
            clearTimeout(timeoutId);

            if (error) {
              // Handle specific Supabase errors
              const errCode = (error as { code?: string }).code;
              const errStatus = (error as { status?: number }).status;
              if (errCode === 'PGRST116' || errStatus === 416) {
                // No more items available
                startTransition(() => {
                  setHasMore(false);
                });
                setInitialLoad(false);
                setError(null);
                resolve();
                return;
              }
              
              // Handle 500 errors (like the one at offset 90)
              if (errStatus === 500) {
                console.warn('Server error at offset', page * ITEMS_PER_PAGE, '- may be hitting a limit');
                startTransition(() => {
                  setHasMore(false);
                });
                setInitialLoad(false);
                setError('Unable to load more products at this time.');
                resolve();
                return;
              }
              
              throw error;
            }

            const newData = (data as (ProductWithDetails & { total_count: number })[]) || [];
            const totalCount = newData[0]?.total_count || 0;

            // Store in cache
            if (totalCount != null) totalCountRef.current[filtersKey] = totalCount;
            prefetchCacheRef.current[requestKey] = { 
              key: requestKey, 
              data: newData, 
              count: totalCount 
            };

            // Prefetch next page
            scheduleIdle(async () => {
              try {
                const nextKey = `${JSON.stringify(filters)}-${page + 1}-${sortOrder}`;
                if (!prefetchCacheRef.current[nextKey]) {
                  const nextParams = buildRpcParams(filters, page + 1, sortOrder);
                  const { data: nextData, error: nextError } = await supabase.rpc('get_products_filtered', nextParams);
                  if (!nextError && Array.isArray(nextData)) {
                    const nextCount = nextData[0]?.total_count || null;
                    prefetchCacheRef.current[nextKey] = { 
                      key: nextKey, 
                      data: nextData as ProductWithDetails[], 
                      count: nextCount 
                    };
                    if (nextCount != null) totalCountRef.current[filtersKey] = nextCount;
                    
                    const nextIds = nextData.map(p => p.id).filter(Boolean);
                    if (nextIds.length) fetchBatchPricingFor(nextIds);
                  }
                }
              } catch {
                /* ignore prefetch failures */
              }
            });

            // Update state
            startTransition(() => {
              setProducts(prev => (page === 0 || isFilterChange ? newData : mergeUniqueProducts(prev, newData)));
              
              const loadedItemsCount = (page + 1) * ITEMS_PER_PAGE;
              
              if (newData.length === 0 || newData.length < ITEMS_PER_PAGE) {
                setHasMore(false);
              } else if (totalCount > 0) {
                setHasMore(loadedItemsCount < totalCount);
              } else {
                setHasMore(newData.length === ITEMS_PER_PAGE);
              }
            });

            // Fetch pricing for new products
            if (newData.length > 0) {
              const ids = newData.map(p => p.id).filter(Boolean);
              scheduleIdle(() => fetchBatchPricingFor(ids));
            }

            setInitialLoad(false);
            setError(null);
            resolve();
          } catch (err) {
            // Handle abort errors
            const maybeErr = err as unknown;
            if (typeof maybeErr === 'object' && maybeErr !== null) {
              const name = (maybeErr as { name?: string }).name;
              const message = (maybeErr as { message?: string }).message;
              if (name === 'AbortError' || message?.includes('AbortError')) {
                return;
              }
              
              const code = (maybeErr as { code?: string }).code;
              const status = (maybeErr as { status?: number }).status;
              if (code === 'PGRST116' || status === 416) {
                setHasMore(false);
                setInitialLoad(false);
                setError(null);
                return;
              }
            }

            console.error('Fetch error:', err);
            setError('Failed to load products.');
            setHasMore(false);
            reject(err);
          } finally {
            if (!controller.signal.aborted) {
              setLoading(false);
              isFetchingRef.current = false;
              observerLockRef.current = false;
            }
            pendingRequestsRef.current.delete(requestKey);
          }
        });
      });

      pendingRequestsRef.current.set(requestKey, requestPromise);
      return requestPromise;
    },
    [fetchBatchPricingFor, scheduleIdle, mergeUniqueProducts, enqueueRequest, buildRpcParams]
  );

  // Updated initial data fetching using views instead of MVs
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const supabase = getSupabase();

        // Fetch shops from view
        const shopData = await fetchWithCache('distinct_shops', async () => {
          try {
            setInitialDataLoaded(true);
            const { data, error } = await supabase
              .from('distinct_shops')
              .select('id, name')
              .order('name', { ascending: true });
            if (error) throw error;
            return data;
          } catch (error) {
            console.warn('Shop list load timed out, using empty array.', error);
            return []; // Return empty, allow page to render products
          }
        });

        if (shopData) {
          setShopList(
            shopData
              .map(item => ({ id: Number(item.id || 0), shop_name: item.name || '' }))
              .filter(item => item.shop_name !== '')
          );
        }
      
        // Fetch size groups from view
        const sizeData = await fetchWithCache('size_groups', async () => {
          const { data, error } = await supabase
            .from('distinct_size_groups')
            .select('size_group');
          
          if (error) throw error;
          return data as Array<{ size_group?: unknown }>;
        });
        
        if (sizeData) {
          setAllSizeData(
            sizeData
              .map(item => ({
                size_group: item.size_group != null ? String(item.size_group) : ''
              }))
              .filter(item => item.size_group !== '')
          );
        }

        // Fetch grouped product types from view
        const groupedTypeData = await fetchWithCache('grouped_types', async () => {
          const { data, error } = await supabase
            .from('distinct_grouped_types')
            .select('grouped_product_type');
          
          if (error) throw error;
          return data as Array<{ grouped_product_type?: unknown }>;
        });
        
        if (groupedTypeData) {
          setAllGroupedTypes(
            groupedTypeData
              .map(item => ({
                grouped_product_type: item.grouped_product_type != null ? 
                  String(item.grouped_product_type) : ''
              }))
              .filter(item => item.grouped_product_type !== '')
              .sort((a, b) => a.grouped_product_type.localeCompare(b.grouped_product_type))
          );
        }

        // Fetch top level categories from view
        const topLevelData = await fetchWithCache('top_level_categories', async () => {
          const { data, error } = await supabase
            .from('distinct_top_level_categories')
            .select('top_level_category');
          
          if (error) throw error;
          return data as Array<{ top_level_category?: unknown }>;
        });
        
        if (topLevelData) {
          setAllTopLevelCategories(
            topLevelData
              .map(item => ({
                top_level_category: item.top_level_category != null ? 
                  String(item.top_level_category) : ''
              }))
              .filter(item => item.top_level_category !== '')
              .sort((a, b) => a.top_level_category.localeCompare(b.top_level_category))
          );
        }

        // Fetch gender ages from view
        const genderData = await fetchWithCache('gender_ages', async () => {
          const { data, error } = await supabase
            .from('distinct_gender_ages')
            .select('gender_age');
          
          if (error) throw error;
          return data as Array<{ gender_age?: unknown }>;
        });
        
        if (genderData) {
          setAllGenderAges(
            genderData
              .map(item => ({
                gender_age: item.gender_age != null ? 
                  String(item.gender_age) : ''
              }))
              .filter(item => item.gender_age !== '')
              .sort((a, b) => a.gender_age.localeCompare(b.gender_age))
          );
        }
      } catch (error) {
        setInitialDataLoaded(true);
        console.error('Error fetching initial data:', error);
      }
    }
    
    fetchInitialData();
  }, [fetchWithCache]);

  useEffect(() => {
    if (!shopList || shopList.length === 0) return;

    const needsMapping = selectedShopName.some(s => !/^\d+$/.test(s));
    if (!needsMapping) return;

    const mapped = selectedShopName.map(s => {
      if (/^\d+$/.test(s)) return s;
      const found = shopList.find(x => (x.shop_name || '').toLowerCase() === String(s).toLowerCase());
      return found ? String(found.id) : null;
    }).filter(Boolean) as string[];

    if (mapped.length > 0) setSelectedShopName(Array.from(new Set(mapped)));
    else setSelectedShopName([]);
  }, [shopList, selectedShopName]);

  const [committedFilters, setCommittedFilters] = useState<FilterOptions>(() => ({
    selectedShopName,
    selectedSizeGroups,
    selectedGroupedTypes,
    selectedTopLevelCategories,
    selectedGenderAges,
    inStockOnly,
    onSaleOnly,
    searchQuery,
    selectedPriceRange,
  }));

  const commitFiltersDebounced = useRef(createDebounced((filters: FilterOptions) => {
    setCommittedFilters(filters);
  }, 500)).current;

  const selectedShopNameKey = useMemo(() => JSON.stringify(selectedShopName), [selectedShopName]);
  const selectedSizeGroupsKey = useMemo(() => JSON.stringify(selectedSizeGroups), [selectedSizeGroups]);
  const selectedGroupedTypesKey = useMemo(() => JSON.stringify(selectedGroupedTypes), [selectedGroupedTypes]);
  const selectedTopLevelCategoriesKey = useMemo(() => JSON.stringify(selectedTopLevelCategories), [selectedTopLevelCategories]);
  const selectedGenderAgesKey = useMemo(() => JSON.stringify(selectedGenderAges), [selectedGenderAges]);
  const selectedPriceRangeKey = useMemo(() => JSON.stringify(selectedPriceRange), [selectedPriceRange]);
  const committedFiltersKey = useMemo(() => JSON.stringify(committedFilters), [committedFilters]); // <-- ADD THIS LINE
  
  useEffect(() => {
    const pendingFilters: FilterOptions = {
      selectedShopName: JSON.parse(selectedShopNameKey),
      selectedSizeGroups: JSON.parse(selectedSizeGroupsKey),
      selectedGroupedTypes: JSON.parse(selectedGroupedTypesKey),
      selectedTopLevelCategories: JSON.parse(selectedTopLevelCategoriesKey),
      selectedGenderAges: JSON.parse(selectedGenderAgesKey),
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange: JSON.parse(selectedPriceRangeKey) as [number, number],
    };
  
    const pendingKey = JSON.stringify(pendingFilters);
  
    if (pendingKey === committedFiltersKey) return;
  
    // Always reset page when filters change
    setPage(0);
    setProducts([]);
    setInitialLoad(true);
    setHasMore(true);
    
    // Update committed filters immediately (not debounced)
    setCommittedFilters(pendingFilters);
  }, [
    selectedShopNameKey,
    selectedSizeGroupsKey,
    selectedGroupedTypesKey,
    selectedTopLevelCategoriesKey,
    selectedGenderAgesKey,
    inStockOnly,
    onSaleOnly,
    searchQuery,
    selectedPriceRangeKey,
    committedFiltersKey
  ]);
  
  // Reset page when filters or sort order change
  useEffect(() => {
    setPage(0);
    setProducts([]);  // CRITICAL: Clear products when filters change
    setInitialLoad(true);
    setHasMore(true);
    isFetchingRef.current = false;
    observerLockRef.current = false;
  }, [sortOrder]);

  // Also reset when shop filter changes
  useEffect(() => {
    setPage(0);
    setProducts([]);
    setInitialLoad(true);
    setHasMore(true);
    isFetchingRef.current = false;
    observerLockRef.current = false;
  }, [selectedShopNameKey]);

  // Initial load effect
  useEffect(() => {
    if (initialLoad && initialDataLoaded) {
      fetchFilteredProducts(committedFilters, 0, sortOrder, true).catch(err => {
        if ((err as Error)?.name !== 'AbortError') {
          console.error('Initial load error:', err);
        }
      });
    }
  }, [initialLoad, committedFilters, sortOrder, fetchFilteredProducts, initialDataLoaded]);

  // Fetch when page changes (for infinite scroll)
  useEffect(() => {
    if (page === 0) return;

    fetchFilteredProducts(committedFilters, page, sortOrder, false).catch(err => {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('Error:', err);
      }
    });
  }, [page, sortOrder, fetchFilteredProducts, committedFilters]);

  // Persist filters to localStorage
  useEffect(() => {
    localStorage.setItem('selectedShopName', JSON.stringify(selectedShopName));
  }, [selectedShopName]);
  
  useEffect(() => {
    localStorage.setItem('selectedGroupedTypes', JSON.stringify(selectedGroupedTypes));
  }, [selectedGroupedTypes]);
  
  useEffect(() => {
    localStorage.setItem('selectedTopLevelCategories', JSON.stringify(selectedTopLevelCategories));
  }, [selectedTopLevelCategories]);
  
  useEffect(() => {
    localStorage.setItem('selectedGenderAges', JSON.stringify(selectedGenderAges));
  }, [selectedGenderAges]);
  
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
    try {
      localStorage.setItem('sortOrder', sortOrder);
    } catch {
      /* ignore */
    }
  }, [sortOrder]);

  useEffect(() => {
    localStorage.setItem('selectedPriceRange', JSON.stringify(selectedPriceRange));
  }, [selectedPriceRange]);

  useEffect(() => {
    localStorage.setItem('selectedSizeGroups', JSON.stringify(selectedSizeGroups));
  }, [selectedSizeGroups]);

  useEffect(() => {
    if (!loading) {
      isFetchingRef.current = false;
      observerLockRef.current = false;
    }
  }, [loading]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting && 
          !loading && 
          !isFetchingRef.current && 
          hasMore &&
          !observerLockRef.current &&
          products.length > 0
        ) {
          observerLockRef.current = true;
          isFetchingRef.current = true;
          
          startTransition(() => {
            setPage(prev => prev + 1);
          });
        }
      },
      { rootMargin: '800px', threshold: 0.1 } // Increased from 400px to trigger earlier
    );

    const currentRef = observerRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [loading, hasMore, products.length, committedFilters, sortOrder, page]);

  // Cleanup
  useEffect(() => {
    return () => {
      isFetchingRef.current = false;
      observerLockRef.current = false;
    };
  }, []);

  useEffect(() => {
    const capturedPendingRequests = pendingRequestsRef.current;
    const capturedInflightFetches = inflightFetchesRef.current;
    const capturedCommitCancel = commitFiltersDebounced?.cancel;
    
    type CancelableDebounced = { cancel?: () => void };
    const capturedFetchPricingCancel =
      typeof fetchPricingDebounced !== 'undefined' && typeof (fetchPricingDebounced as CancelableDebounced).cancel === 'function'
        ? (fetchPricingDebounced as CancelableDebounced).cancel
        : undefined;

    return () => {
      if (currentRequestRef.current) {
        currentRequestRef.current.abort();
      }
      if (typeof capturedCommitCancel === 'function') {
        capturedCommitCancel();
      }
      if (typeof capturedFetchPricingCancel === 'function') {
        capturedFetchPricingCancel();
      }

      try {
        if (capturedPendingRequests && typeof (capturedPendingRequests as Map<string, Promise<void>>).clear === 'function') {
          (capturedPendingRequests as Map<string, Promise<void>>).clear();
        }
      } catch {
        /* ignore */
      }

      try {
        if (capturedInflightFetches && typeof (capturedInflightFetches as Map<string, Promise<unknown>>).clear === 'function') {
          (capturedInflightFetches as Map<string, Promise<unknown>>).clear();
        }
      } catch {
        /* ignore */
      }

      requestQueueRef.current = [];
      prefetchCacheRef.current = {};
    };
  }, [commitFiltersDebounced, fetchPricingDebounced]);

  const sortOptions = [
    { value: 'asc', label: '$ Low-High' },
    { value: 'desc', label: '$ High-Low' },
    { value: 'discount_desc', label: '% High-Low' },
  ];

  const shopOptions = shopList.map((s) => ({
    value: String(s.id),
    label: s.shop_name || String(s.id),
  }));

  const getShopLabel = useCallback((idOrName: string) => {
    const found = shopList.find(s => String(s.id) === idOrName);
    return found ? found.shop_name : idOrName;
  }, [shopList]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/?search=${searchQuery}`);
  };

  const handleSortChange = (value: string) => {
    const parsed = value as SortOrder;
    setSortOrder(parsed);

    const pendingFilters: FilterOptions = {
      selectedShopName,
      selectedSizeGroups,
      selectedGroupedTypes,
      selectedTopLevelCategories,
      selectedGenderAges,
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange,
    };

    if (commitFiltersDebounced.cancel) commitFiltersDebounced.cancel();
    setCommittedFilters(pendingFilters);
    setPage(0);
  };

  const handleSliderChangeEnd = (values: number[]) => {
    const [minValue, maxValue] = values;
    setSelectedPriceRange([minValue, maxValue]);
    setCommittedFilters({
      selectedShopName,
      selectedSizeGroups,
      selectedGroupedTypes,
      selectedTopLevelCategories,
      selectedGenderAges,
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange: [minValue, maxValue],
    });
  };

  const handlePriceInputChange = (type: 'min' | 'max', value: string) => {
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) return;

    if (type === 'min') {
      const newMin = Math.min(Math.max(numericValue, ABS_MIN_PRICE), selectedPriceRange[1]);
      setSelectedPriceRange([newMin, selectedPriceRange[1]]);
    } else {
      const newMax = Math.max(Math.min(numericValue, ABS_MAX_PRICE), selectedPriceRange[0]);
      setSelectedPriceRange([selectedPriceRange[0], newMax]);
    }
  };
  
  const getCurrentSizeOptions = () => {
    const uniqueSizeGroups = Array.from(
      new Set(allSizeData.map(item => item.size_group))
    ).filter(Boolean);
    
    return uniqueSizeGroups.map(size => ({
      value: size,
      label: size
    }));
  };

  const getCurrentGroupedTypeOptions = () => {
    const uniqueGroupedTypes = Array.from(
      new Set(allGroupedTypes.map(item => item.grouped_product_type))
    ).filter(Boolean);
    
    return uniqueGroupedTypes.map(type => ({
      value: type,
      label: type
    }));
  };

  const getCurrentTopLevelOptions = () => {
    const uniqueCategories = Array.from(
      new Set(allTopLevelCategories.map(item => item.top_level_category))
    ).filter(Boolean);
    
    return uniqueCategories.map(category => ({
      value: category,
      label: category
    }));
  };

  const getCurrentGenderAgeOptions = () => {
    const uniqueGenderAges = Array.from(
      new Set(allGenderAges.map(item => item.gender_age))
    ).filter(Boolean);
    
    return uniqueGenderAges.map(gender => ({
      value: gender,
      label: gender
    }));
  };

  const SizeGroupsFilter = () => {  
    return (
      <div>
        <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
          Sizes {selectedSizeGroups.length > 0 && (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
              ({selectedSizeGroups.length} selected)
            </span>
          )}
        </h3>        
        <MultiSelectDropdown
          options={getCurrentSizeOptions()}
          selected={selectedSizeGroups}
          onChange={setSelectedSizeGroups}
          placeholder="All sizes"
        />
      </div>
    );
  };

  const GroupedTypesFilter = () => {  
    return (
      <div>
        <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
          Product Types {selectedGroupedTypes.length > 0 && (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
              ({selectedGroupedTypes.length} selected)
            </span>
          )}
        </h3>        
        <MultiSelectDropdown
          options={getCurrentGroupedTypeOptions()}
          selected={selectedGroupedTypes}
          onChange={setSelectedGroupedTypes}
          placeholder="All types"
        />
      </div>
    );
  };

  const TopLevelCategoriesFilter = () => {  
    return (
      <div>
        <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
          Main Categories {selectedTopLevelCategories.length > 0 && (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
              ({selectedTopLevelCategories.length} selected)
            </span>
          )}
        </h3>        
        <MultiSelectDropdown
          options={getCurrentTopLevelOptions()}
          selected={selectedTopLevelCategories}
          onChange={setSelectedTopLevelCategories}
          placeholder="All categories"
        />
      </div>
    );
  };

  const GenderAgeFilter = () => {  
    return (
      <div>
        <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">
          Gender/Age {selectedGenderAges.length > 0 && (
            <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
              ({selectedGenderAges.length} selected)
            </span>
          )}
        </h3>        
        <MultiSelectDropdown
          options={getCurrentGenderAgeOptions()}
          selected={selectedGenderAges}
          onChange={setSelectedGenderAges}
          placeholder="All genders/ages"
        />
      </div>
    );
  };

  const isFetchingEmpty = products.length === 0 && (
    loading ||
    (pendingRequestsRef.current && pendingRequestsRef.current.size > 0) ||
    currentRequestRef.current !== null
  );

  const handleClearAllFilters = () => {
    setSelectedShopName([]);
    setSelectedGroupedTypes([]);
    setSelectedTopLevelCategories([]);
    setSelectedGenderAges([]);
    setInStockOnly(false);
    setOnSaleOnly(false);
    setSelectedSizeGroups([]);
    setSelectedPriceRange([...PRICE_RANGE]);
    setSearchQuery('');
  };

  function ProductCardSkeleton() {
    return (
      <div 
        className="w-full h-full min-h-[320px] bg-gray-100 dark:bg-gray-800 rounded-lg p-3 animate-pulse sm:p-4 flex flex-col"
      >
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
          <div 
            key={`skeleton-${i}`} 
            className="h-full"
            style={{ 
              contain: 'layout size style',
              contentVisibility: 'auto',
              containIntrinsicSize: '260px'
            }}
          >
            <ProductCardSkeleton />
          </div>
        ))}
      </>
    );
  }
  
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Header
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      
      <div className="mx-auto px-4 py-4 mt-16 sm:px-6 sm:py-6 lg:px-8 max-w-screen-2xl">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <div className="w-full lg:w-80 xl:w-96">
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
                    selectedGroupedTypes.length > 0 ||
                    selectedTopLevelCategories.length > 0 ||
                    selectedGenderAges.length > 0 ||
                    inStockOnly !== false || 
                    onSaleOnly !== false || 
                    !rangesEqual(selectedPriceRange, PRICE_RANGE) ? (
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-blue-600 rounded-full sm:px-2 sm:py-1">
                        Active
                      </span>
                  ) : null}
                </div>
                {showFilters ? (
                  <AsyncLucideIcon name="ChevronUp" className="h-4 w-4 text-gray-600 dark:text-gray-400 sm:h-5 sm:w-5" />
                ) : (
                  <AsyncLucideIcon name="ChevronDown" className="h-4 w-4 text-gray-600 dark:text-gray-400 sm:h-5 sm:w-5" />
                )}
              </button>
            </div>
  
            <div className={`${showFilters ? 'block' : 'hidden'} lg:block lg:sticky lg:top-24 lg:self-start`}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 space-y-4 sm:p-4 sm:space-y-6 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto scrollbar-gutter-stable both-edges lg:pr-2 lg:mr-4">
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
                    isLoading={shopOptions.length === 0 && selectedShopName.length > 0}
                  />
                </div>

                <GroupedTypesFilter />
                <TopLevelCategoriesFilter />
                <GenderAgeFilter />

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
                          min={ABS_MIN_PRICE}
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
                          max={ABS_MAX_PRICE}
                        />
                      </div>
                    </div>
                    <TransformSlider
                      step={1}
                      min={Math.min(PRICE_RANGE[0], selectedPriceRange[0])}
                      max={Math.max(PRICE_RANGE[1], selectedPriceRange[1])}
                      value={selectedPriceRange}
                      onFinalChange={(values) => handleSliderChangeEnd(values)}
                    />
                  </div>
                </div>

                <SizeGroupsFilter />
                
                <div>
                  <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 sm:text-sm sm:mb-3">Filters</h3>
                  <div className="flex gap-4 sm:gap-6">
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

                {(selectedShopName.length > 0 || 
                  selectedGroupedTypes.length > 0 ||
                  selectedTopLevelCategories.length > 0 ||
                  selectedGenderAges.length > 0 ||
                  inStockOnly !== false || 
                  onSaleOnly !== false || 
                  !rangesEqual(selectedPriceRange, PRICE_RANGE)) && (
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
                                {getShopLabel(shop)}
                                  <button 
                                  onClick={() => setSelectedShopName(prev => prev.filter(s => s !== shop))}
                                  className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}

                        {selectedGroupedTypes.length > 0 && (
                          <>
                            {selectedGroupedTypes.map(type => (
                              <div 
                                key={type}
                                className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1"
                              >
                                {type}
                                <button 
                                  onClick={() => setSelectedGroupedTypes(prev => prev.filter(t => t !== type))}
                                  className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}

                        {selectedTopLevelCategories.length > 0 && (
                          <>
                            {selectedTopLevelCategories.map(category => (
                              <div 
                                key={category}
                                className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1"
                              >
                                {category}
                                <button 
                                  onClick={() => setSelectedTopLevelCategories(prev => prev.filter(c => c !== category))}
                                  className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}

                        {selectedGenderAges.length > 0 && (
                          <>
                            {selectedGenderAges.map(gender => (
                              <div 
                                key={gender}
                                className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1"
                              >
                                {gender}
                                <button 
                                  onClick={() => setSelectedGenderAges(prev => prev.filter(g => g !== gender))}
                                  className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                                >
                                  <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                                </button>
                              </div>
                            ))}
                          </>
                        )}

                        {!rangesEqual(selectedPriceRange, PRICE_RANGE) && (
                          <div className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-500/30 sm:px-2 sm:py-1">
                            ${selectedPriceRange[0]} - ${selectedPriceRange[1]}
                              <button 
                              onClick={() => setSelectedPriceRange([...PRICE_RANGE])}
                              className="ml-1 inline-flex text-blue-500 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100"
                            >
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
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
                                  <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
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
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
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
                              <AsyncLucideIcon name="X" className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={handleClearAllFilters}
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
  
          <div className="flex-1 will-change-transform">
            <div className="mb-3 flex justify-end sm:mb-4">
              <div className="w-40 sm:w-48 min-w-0">
                <label className="sr-only">Sort By</label>
                <SingleSelectDropdown
                  options={sortOptions}
                  selected={sortOrder}
                  onChange={handleSortChange}
                  placeholder="Featured"
                  className="truncate"
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setPage(0);
                    setProducts([]);
                    setInitialLoad(true);
                  }}
                  className="mt-2 text-red-600 dark:text-red-400 hover:underline text-xs"
                >
                  Try again
                </button>
              </div>
            )}

        <div 
          className="relative min-h-[400px]"
          style={{ 
            contain: 'layout',
            contentVisibility: 'auto',
            containIntrinsicSize: '400px 1000px'
          }}
        >
          <div 
            className="grid gap-x-3 gap-y-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-x-4 sm:gap-y-6 xl:gap-x-6"
          >
            {initialLoad ? (
              <ProductGridSkeleton count={8} />
            ) : isFetchingEmpty ? (
              <div className="col-span-full flex flex-col items-center justify-center min-h-[150px] sm:min-h-[200px]">
                <AsyncLucideIcon name="Loader2" className="animate-spin h-8 w-8 text-gray-600 dark:text-gray-300 mb-3" />
                <p className="text-gray-900 dark:text-gray-100 text-sm sm:text-base">Loading products…</p>
              </div>
            ) : products.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center min-h-[150px] space-y-1 sm:min-h-[200px] sm:space-y-2">
                <p className="text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                  {searchQuery || selectedShopName.length > 0 || 
                   selectedGroupedTypes.length > 0 || selectedTopLevelCategories.length > 0 || 
                   selectedGenderAges.length > 0
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
                {products.map((product, index) => {
                  const pid = String(product.id);
                  return (
                    <div
                      key={`${product.id}-${product.shop_id}`}
                      className="h-full min-h-[320px]" // Add min-height here
                      data-prod-id={pid}
                      style={{ 
                        contain: 'layout size style',
                        contentVisibility: 'auto',
                      }}
                      ref={(el) => {
                        if (el) {
                          cardRefs.current.set(pid, el);
                        } else {
                          cardRefs.current.delete(pid);
                        }
                      }}
                    >
                      <ProductCard
                        product={product}
                        pricing={productPricings[pid]}
                        isLcp={page === 0 && index < LCP_PRELOAD_COUNT}
                      />
                    </div>
                  );
                })}
                
                {hasMore && (
                  <div 
                    className="absolute inset-0 pointer-events-none opacity-0"
                    style={{ zIndex: -1 }}
                  >
                    <div className="grid gap-x-3 gap-y-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-x-4 sm:gap-y-6 xl:gap-x-6">
                      <ProductGridSkeleton count={ITEMS_PER_PAGE} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          {loading && page > 0 && (
            <div className="absolute bottom-0 left-0 right-0 flex justify-center py-4 z-10">
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