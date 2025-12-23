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
import { SupabaseClient } from '@supabase/supabase-js';

const ITEMS_PER_PAGE = 10;
const INITIAL_RENDER_COUNT = 4;
const LCP_PRELOAD_COUNT = INITIAL_RENDER_COUNT;

// Different MVs for different scenarios
const MVS = {
  DEFAULT: 'products_default_mv',
  SHOP_FILTERED: 'products_by_shop_mv',
  SIZE_FILTERED: 'products_by_size_mv',
  ON_SALE: 'products_on_sale_mv',
  ACTIVE_LISTINGS: 'products_active_listings_mv',
} as const;

type MaterializedView = typeof MVS[keyof typeof MVS];

export function HomePage() {
  const [products, setProducts] = useState<ProductWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [shopList, setShopList] = useState<Array<{id: number; shop_name: string}>>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | 'discount_desc'>(() => {
    try {
      if (typeof window === 'undefined') return 'discount_desc';
      const stored = localStorage.getItem('sortOrder');
      if (stored === 'asc' || stored === 'desc' || stored === 'discount_desc') return stored;
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
  
  const fetchBatchPricingFor = useCallback(async (ids: Array<number | string>) => {
    const uniqueIds = Array.from(new Set(ids.map(String))).filter(Boolean);
    if (uniqueIds.length === 0) return;

    const idsToFetch = uniqueIds.filter(id => !(id in productPricings));
    if (idsToFetch.length === 0) return;

    const supabase = getSupabase();
    const pricingMap: Record<string, {variantPrice: number | null; compareAtPrice: number | null; offerPrice: number | null;}> = {};

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_products_pricing', { 
        product_ids: idsToFetch 
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

  const requestQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const currentRequestKeyRef = useRef<string>('');
  const prefetchCacheRef = useRef<Record<number, { key: string; data: ProductWithDetails[]; count: number }>>({});
  
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
    inStockOnly: boolean;
    onSaleOnly: boolean;
    searchQuery: string;
    selectedPriceRange: [number, number];
  }

  // Smart MV selection based on active filters
  const getOptimizedMV = useCallback((filters: FilterOptions): MaterializedView => {
    const hasShopFilter = filters.selectedShopName.length > 0;
    const hasSizeFilter = filters.selectedSizeGroups.length > 0;
    const hasSaleFilter = filters.onSaleOnly;
    const hasSearchFilter = !!filters.searchQuery;
    
    if (hasSearchFilter) {
      return MVS.DEFAULT;
    }
    
    if (hasSaleFilter && !hasShopFilter && !hasSizeFilter) {
      return MVS.ON_SALE;
    }
    
    if (hasShopFilter && !hasSizeFilter && !hasSaleFilter) {
      return MVS.SHOP_FILTERED;
    }
    
    if (hasSizeFilter && !hasShopFilter && !hasSaleFilter) {
      return MVS.SIZE_FILTERED;
    }
    
    return MVS.DEFAULT;
  }, []);

  const buildOptimizedQuery = useCallback((
  supabase: SupabaseClient,
  mvName: MaterializedView,
  filters: FilterOptions,
  sortOrder: 'asc' | 'desc' | 'discount_desc',
  page: number
) => {
  let query = supabase
    .from(mvName)
    .select('id,shop_id,title,shop_name,created_at,url,description,in_stock,min_price,max_discount_percentage,on_sale,size_groups,images,product_type,tags,vendor,handle', { 
      count: 'exact',
      head: false
    })
    .limit(ITEMS_PER_PAGE);

  query = query
    .gte('min_price', filters.selectedPriceRange[0])
    .lte('min_price', filters.selectedPriceRange[1]);

  if (filters.inStockOnly) {
    query = query.eq('in_stock', true);
  }

  if (mvName === MVS.SHOP_FILTERED || mvName === MVS.DEFAULT || mvName === MVS.ON_SALE) {
    if (filters.selectedShopName.length > 0) {
      const shopIds = filters.selectedShopName
        .map(s => Number(s))
        .filter(n => !Number.isNaN(n) && n > 0);
      
      if (shopIds.length > 0) {
        query = query.in('shop_id', shopIds);
      }
    }
  }

  if (mvName === MVS.SIZE_FILTERED || mvName === MVS.DEFAULT || mvName === MVS.ON_SALE) {
    if (filters.selectedSizeGroups.length > 0) {
      query = query.overlaps('size_groups', filters.selectedSizeGroups);
    }
  }

  if (filters.onSaleOnly && mvName !== MVS.ON_SALE) {
    query = query.eq('on_sale', true);
  }

  if (filters.searchQuery) {
    const cleanSearch = filters.searchQuery.trim();
    
    if (cleanSearch) {
      query = query.textSearch('fts', cleanSearch, {
        type: 'websearch',
        config: 'english'
      });
    }
  }

  if (sortOrder === 'discount_desc') {
    query = query.order('max_discount_percentage', { ascending: false, nullsFirst: false });
  } else if (sortOrder === 'asc') {
    query = query.order('min_price', { ascending: true });
  } else {
    query = query.order('min_price', { ascending: false });
  }
  
  query = query.order('created_at', { ascending: false });

  return query.range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
}, []);

  const fetchFilteredProducts = useCallback(
    async (
      filters: FilterOptions,
      page: number,
      sortOrder: 'asc' | 'desc' | 'discount_desc',
      attempt = 1
    ) => {
      const TIMEOUT_MS = 8000;
      const requestKey = `${JSON.stringify(filters)}-${page}-${sortOrder}-${attempt}`;
      
      if (pendingRequestsRef.current.has(requestKey)) {
        return pendingRequestsRef.current.get(requestKey)!;
      }
      
      const requestPromise = new Promise<void>((resolve, reject) => {
        enqueueRequest(async () => {
          if (page === 0 && currentRequestRef.current) {
            currentRequestRef.current.abort();
          }

          const controller = new AbortController();
          currentRequestRef.current = controller;
          currentRequestKeyRef.current = requestKey;

          const timeoutId = setTimeout(() => {
            if (!controller.signal.aborted) {
              controller.abort();
            }
          }, TIMEOUT_MS);

          const myRequestId = ++requestIdRef.current;

          isFetchingRef.current = true;
          setLoading(true);
          
          try {
            if (page > 0) {
              await new Promise(resolve => setTimeout(resolve, 30));
            }
            
            const cacheKey = JSON.stringify({ filters, sortOrder });
            const cached = prefetchCacheRef.current[page];
            if (cached && cached.key === cacheKey) {
              if (myRequestId !== requestIdRef.current) return;

              clearTimeout(timeoutId);
              
              startTransition(() => {
                setProducts(prev => 
                  page === 0 
                    ? (cached.data || []) 
                    : mergeUniqueProducts(prev, (cached.data as unknown as ProductWithDetails[]) || [])
                );
              });
              
              const ids = ((cached.data as unknown as ProductWithDetails[]) || []).map(p => p.id).filter(Boolean);
              if (ids.length > 0) {
                const lcpIds = ids.slice(0, LCP_PRELOAD_COUNT);
                if (lcpIds.length > 0) {
                  fetchBatchPricingFor(lcpIds).catch(e => console.error('Error fetching LCP batch pricing for cached page items', e));
                }

                const rest = ids.slice(LCP_PRELOAD_COUNT);
                if (rest.length > 0) {
                  scheduleIdle(() => fetchBatchPricingFor(rest));
                }
              }
              
              setHasMore((cached.data?.length || 0) >= ITEMS_PER_PAGE || (page + 1) * ITEMS_PER_PAGE < (cached.count || 0));
              setInitialLoad(false);
              setError(null);
              setLoading(false);
              isFetchingRef.current = false;
              resolve();
              return;
            }

            const supabase = getSupabase();
            const mvName = getOptimizedMV(filters);

            const query = buildOptimizedQuery(supabase, mvName, filters, sortOrder, page);
            query.abortSignal(controller.signal);

            const { data, error, count } = await query;

            clearTimeout(timeoutId);

            if (currentRequestKeyRef.current !== requestKey) {
              isFetchingRef.current = false;
              resolve();
              return;
            }

            if (error) {
              if ((error.message.includes('timeout') || error.code === '57014') && attempt < 2) {
                await new Promise(res => setTimeout(res, 500 * attempt));
                
                const fallbackQuery = buildOptimizedQuery(supabase, MVS.DEFAULT, filters, sortOrder, page);
                const { data: fallbackData, error: fallbackError, count: fallbackCount } = await fallbackQuery;
                
                if (fallbackError) throw fallbackError;
                
                const totalItems = fallbackCount || 0;
                const loadedItems = page * ITEMS_PER_PAGE + (fallbackData?.length || 0);
                const moreAvailable = loadedItems < totalItems;
                
                startTransition(() => {
                  setProducts(prev => 
                    page === 0 
                      ? (fallbackData as unknown as ProductWithDetails[]) || [] 
                      : mergeUniqueProducts(prev, (fallbackData as unknown as ProductWithDetails[] || []))
                  );
                });
                
                setHasMore(moreAvailable);
                setInitialLoad(false);
                setError(null);
                setLoading(false);
                isFetchingRef.current = false;
                resolve();
                return;
              }
              throw error;
            }

            const totalItems = count || 0;
            const loadedItems = page * ITEMS_PER_PAGE + (data?.length || 0);
            const moreAvailable = (data?.length || 0) >= ITEMS_PER_PAGE || loadedItems < totalItems;
              
            startTransition(() => {
              setProducts(prev => 
                page === 0 
                  ? (data as unknown as ProductWithDetails[]) || [] 
                  : mergeUniqueProducts(prev, (data as unknown as ProductWithDetails[] || []))
              );
            });
            
            if (data && data.length > 0) {
              const dataArray = (data as ProductWithDetails[]) || [];
              const ids = dataArray.map((p: ProductWithDetails) => p.id).filter(Boolean);
              const idsToFetch = page === 0 ? ids.slice(0, 12) : ids;
              if (idsToFetch.length > 0) {
                const lcpIds = idsToFetch.slice(0, LCP_PRELOAD_COUNT);
                if (lcpIds.length > 0) {
                  fetchBatchPricingFor(lcpIds).catch(e => console.error('Error fetching LCP batch pricing', e));
                }

                const rest = idsToFetch.slice(LCP_PRELOAD_COUNT);
                if (rest.length > 0) {
                  scheduleIdle(() => {
                    fetchBatchPricingFor(rest).catch(e => console.error('Error fetching batch pricing', e));
                  });
                }
              }
            }
            
            setHasMore(moreAvailable);
            setInitialLoad(false);
            setError(null);

            const cacheKeyCurrent = JSON.stringify({ filters, sortOrder });
            prefetchCacheRef.current[page] = { 
              key: cacheKeyCurrent, 
              data: (data as unknown as ProductWithDetails[]) || [], 
              count: totalItems 
            };

            isFetchingRef.current = false;
            resolve();

          } catch (error: unknown) {
            clearTimeout(timeoutId);
            
            if (error instanceof Error && error.name !== 'AbortError') {
              console.error('Fetch error:', error);
              
              if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                isFetchingRef.current = false;
                return fetchFilteredProducts(filters, page, sortOrder, attempt + 1);
              }

              setError(
                `Failed to load products: ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              startTransition(() => {
                setProducts([]);
              });
              setHasMore(false);
              isFetchingRef.current = false;
              reject(error);
            }
          } finally {
            if (!controller.signal.aborted) {
              setLoading(false);
              isFetchingRef.current = false;
            }
            pendingRequestsRef.current.delete(requestKey);
          }
        });
      });
      
      pendingRequestsRef.current.set(requestKey, requestPromise);
      return requestPromise;
    },
    [fetchBatchPricingFor, scheduleIdle, mergeUniqueProducts, enqueueRequest, getOptimizedMV, buildOptimizedQuery]
  );

  useEffect(() => {
    async function fetchInitialData() {
      try {
        const supabase = getSupabase();

        const shopData = await fetchWithCache('distinct_shops_mv', async () => {
          const { data, error } = await supabase
            .from('distinct_shops_mv')
            .select('shop_id,shop_name')
            .order('shop_name', { ascending: true });

          if (error) throw error;
          return data as Array<{ shop_id?: number; shop_name?: string }>;
        });

        if (shopData) {
          setShopList(
            shopData
              .map(item => ({ id: Number(item.shop_id || 0), shop_name: item.shop_name || '' }))
              .filter(item => item.shop_name !== '')
          );
        }
      
        const sizeData = await fetchWithCache('size_groups', async () => {
          const { data, error } = await supabase
            .from('distinct_size_groups_mv')
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
      } catch (error) {
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
  const selectedPriceRangeKey = useMemo(() => JSON.stringify(selectedPriceRange), [selectedPriceRange]);
  const committedFiltersKey = useMemo(() => JSON.stringify(committedFilters), [committedFilters]);
  
  useEffect(() => {
    const pendingFilters = {
      selectedShopName: JSON.parse(selectedShopNameKey),
      selectedSizeGroups: JSON.parse(selectedSizeGroupsKey),
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange: JSON.parse(selectedPriceRangeKey) as [number, number],
    };

    const pendingKey = JSON.stringify(pendingFilters);

    if (pendingKey === committedFiltersKey) return;

    if (commitFiltersDebounced.cancel) {
      commitFiltersDebounced.cancel();
    }

    if (page === 0 && products.length === 0) {
      setCommittedFilters(pendingFilters);
    } else {
      commitFiltersDebounced(pendingFilters);
    }
  }, [
    selectedShopNameKey,
    selectedSizeGroupsKey,
    inStockOnly,
    onSaleOnly,
    searchQuery,
    selectedPriceRangeKey,
    page,
    products.length,
    committedFiltersKey,
    commitFiltersDebounced,
  ]);

  // Reset page when filters or sort order change
  useEffect(() => {
    setPage(0);
    setProducts([]);
    setInitialLoad(true);
  }, [committedFiltersKey, sortOrder]);

  // Initial load effect
  useEffect(() => {
    if (initialLoad) {
      fetchFilteredProducts(committedFilters, 0, sortOrder).catch(err => {
        if ((err as Error)?.name !== 'AbortError') {
          console.error('Initial load error:', err);
        }
      });
    }
  }, [initialLoad, committedFilters, sortOrder, fetchFilteredProducts]);

  // Fetch when page changes (for infinite scroll)
  useEffect(() => {
    if (page === 0) return;

    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
    }

    fetchFilteredProducts(committedFilters, page, sortOrder).catch(err => {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('Error:', err);
      }
    });
  }, [page, committedFiltersKey, sortOrder, fetchFilteredProducts, committedFilters]);

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
    }
  }, [loading]);

  useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      const isIntersecting = entries[0]?.isIntersecting;
      // CHANGE: Remove initialLoad check and simplify
      const shouldLoadMore = isIntersecting && !loading && hasMore;
      
      if (shouldLoadMore) {
        setPage(prev => prev + 1);
      }
    },
    { rootMargin: '400px 0px', threshold: 0.01 }
  );

  const currentRef = observerRef.current;
  if (currentRef) observer.observe(currentRef);

  return () => {
    if (currentRef) observer.unobserve(currentRef);
  };
}, [loading, hasMore]);

  useEffect(() => {
  return () => {
    isFetchingRef.current = false;
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
    { value: 'asc', label: 'Price: Low to High' },
    { value: 'desc', label: 'Price: High to Low' },
    { value: 'discount_desc', label: 'Discount: High to Low' },
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
    const parsed = value as 'asc' | 'desc' | 'discount_desc';
    setSortOrder(parsed);

    const pendingFilters: FilterOptions = {
      selectedShopName,
      selectedSizeGroups,
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange,
    };

    if (commitFiltersDebounced?.cancel) commitFiltersDebounced.cancel();
    setCommittedFilters(pendingFilters);
    setPage(0);
  };

  const handleSliderChangeEnd = (values: number[]) => {
    const [minValue, maxValue] = values;
    setSelectedPriceRange([minValue, maxValue]);
    setCommittedFilters({
      selectedShopName,
      selectedSizeGroups,
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

  const isFetchingEmpty = products.length === 0 && (
    loading ||
    (pendingRequestsRef.current && pendingRequestsRef.current.size > 0) ||
    currentRequestRef.current !== null
  );

  const handleClearAllFilters = () => {
    setSelectedShopName([]);
    setInStockOnly(false);
    setOnSaleOnly(false);
    setSelectedSizeGroups([]);
    setSelectedPriceRange([...PRICE_RANGE]);
    setSearchQuery('');
  };

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
      
      <div className="mx-auto px-4 py-4 mt-4 sm:px-6 sm:py-6 lg:px-8 max-w-screen-2xl">
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
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 space-y-4 sm:p-4 sm:space-y-6 max-h-[calc(100vh-6rem)] overflow-auto pr-2 lg:mr-4">
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
              <div className="w-40 sm:w-48">
                <label className="sr-only">Sort By</label>
                <SingleSelectDropdown
                  options={sortOptions}
                  selected={sortOrder}
                  onChange={handleSortChange}
                  placeholder="Featured"
                />
              </div>
            </div>

            <div className="grid gap-x-3 gap-y-4 min-h-[400px] grid-cols-[repeat(auto-fit,minmax(220px,1fr))] sm:gap-x-4 sm:gap-y-6 xl:grid-cols-4 xl:gap-x-6">
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
              ) : isFetchingEmpty ? (
                <div className="col-span-full flex flex-col items-center justify-center min-h-[150px] sm:min-h-[200px]">
                  <AsyncLucideIcon name="Loader2" className="animate-spin h-8 w-8 text-gray-600 dark:text-gray-300 mb-3" />
                  <p className="text-gray-900 dark:text-gray-100 text-sm sm:text-base">Loading products…</p>
                </div>
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
                  {(
                    page === 0 ? products.slice(0, Math.min(INITIAL_RENDER_COUNT, products.length)) : products
                  ).map((product, index) => {
                    const pid = String(product.id);
                    return (
                      <div
                        key={`${product.id}-${product.shop_id}`}
                        className="h-full"
                        data-prod-id={pid}
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
                  {loading && page > 0 && (
                    Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                      <div key={`skeleton-${page}-${i}`} className="h-full">
                        <ProductCardSkeleton />
                      </div>
                    ))
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