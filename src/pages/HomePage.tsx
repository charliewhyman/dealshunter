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

// Slider UI is provided by `TransformSlider` component in `src/components`.

const ITEMS_PER_PAGE = 10;
// Limit how many product cards we render immediately for the initial page
// to reduce main-thread work and network concurrency that can delay LCP.
const INITIAL_RENDER_COUNT = 4;
// Number of top products to mark as potential LCP candidates (preload + eager)
// This covers the first row on most viewports so the true LCP image among
// them is likely to be discovered and prioritized.
const LCP_PRELOAD_COUNT = INITIAL_RENDER_COUNT;

// Materialized view name for optimized queries
const PRODUCTS_MATERIALIZED_VIEW = 'products_active_listings_mv';

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
      // Normalize to array in case older persisted values were a string
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
  // Absolute allowed bounds for manual input (prevents extreme values)
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

  // Batch pricing map to avoid per-card network requests
  const [productPricings, setProductPricings] = useState<Record<string, {variantPrice: number | null; compareAtPrice: number | null; offerPrice: number | null;}>>({});

  // Schedule low-priority work off the main critical path.
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

  // Refs & state for per-card pricing via IntersectionObserver.
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pricedIdsRef = useRef<Set<string>>(new Set());
  
  // Request deduplication
  const pendingRequestsRef = useRef<Map<string, Promise<void>>>(new Map());
  
  const fetchBatchPricingFor = useCallback(async (ids: Array<number | string>) => {
    const uniqueIds = Array.from(new Set(ids.map(String))).filter(Boolean);
    if (uniqueIds.length === 0) return;

    // Skip IDs we already have pricing for to avoid unnecessary load
    const idsToFetch = uniqueIds.filter(id => !(id in productPricings));
    if (idsToFetch.length === 0) return;

    const supabase = getSupabase();
    const pricingMap: Record<string, {variantPrice: number | null; compareAtPrice: number | null; offerPrice: number | null;}> = {};

    // Conservative defaults
    const MAX_ATTEMPTS = 4;
    const INITIAL_BATCH_SIZE = 100;

    // Helper to process a chunk with retries and split-on-timeout behaviour
    const processChunk = async (chunk: string[], attempt = 1) => {
      if (chunk.length === 0) return;

      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_products_pricing', { product_ids: chunk });

        if (!rpcError && Array.isArray(rpcData)) {
          for (const row of rpcData) {
            const pid = String(row.product_id);
            const variantPrice = row.variant_price != null ? parseFloat(String(row.variant_price)) : null;
            const compareAtPrice = row.compare_at_price != null ? parseFloat(String(row.compare_at_price)) : null;
            const offerPrice = row.offer_price != null ? parseFloat(String(row.offer_price)) : null;
            pricingMap[pid] = { variantPrice, compareAtPrice, offerPrice };
          }
          return;
        }

        // If RPC returned an error, check whether it's likely a statement timeout
        const extractErrorMessage = (err: unknown): string => {
          if (!err) return '';
          if (typeof err === 'string') return err;
          if (err instanceof Error) return err.message;
          if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
            return (err as { message?: string }).message || '';
          }
          try {
            return String(err);
          } catch {
            return '';
          }
        };
        const errMsg = rpcError ? extractErrorMessage(rpcError) : '';
        const looksLikeTimeout = /statement timeout|timeout|cancel|504|ETIMEDOUT|ECONNABORTED/i.test(errMsg || '');

        if (looksLikeTimeout && attempt < MAX_ATTEMPTS && chunk.length > 1) {
          // Split chunk into halves and retry each half (helps reduce DB pressure)
          const mid = Math.floor(chunk.length / 2) || 1;
          const left = chunk.slice(0, mid);
          const right = chunk.slice(mid);
          // Backoff a bit before retrying
          await new Promise(res => setTimeout(res, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
          await Promise.all([processChunk(left, attempt + 1), processChunk(right, attempt + 1)]);
          return;
        }

        // Otherwise fall through to table-based batched queries for this chunk
        console.warn('RPC get_products_pricing failed for chunk, falling back to batched queries', rpcError);
      } catch (rpcErr) {
        const msg = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
        const looksLikeTimeout = /statement timeout|timeout|cancel|504|ETIMEDOUT|ECONNABORTED/i.test(msg || '');
        if (looksLikeTimeout && attempt < MAX_ATTEMPTS && chunk.length > 1) {
          const mid = Math.floor(chunk.length / 2) || 1;
          const left = chunk.slice(0, mid);
          const right = chunk.slice(mid);
          await new Promise(res => setTimeout(res, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
          await Promise.all([processChunk(left, attempt + 1), processChunk(right, attempt + 1)]);
          return;
        }

        console.warn('RPC get_products_pricing RPC error for chunk, falling back to batched queries', rpcErr);
      }

      // Fallback per-chunk: fetch variants and offers in two batched queries
      try {
        const today = new Date().toISOString().split('T')[0];

        const vRes = await supabase
          .from('variants')
          .select('product_id, price, compare_at_price')
          .in('product_id', chunk);

        const oRes = await supabase
          .from('offers')
          .select('product_id, price, price_valid_until')
          .in('product_id', chunk)
          .gte('price_valid_until', today);

        const vData = vRes.data as Array<{ product_id: number | string; price?: string | number; compare_at_price?: string | number; }> | null;
        const oData = oRes.data as Array<{ product_id: number | string; price?: string | number; price_valid_until?: string; }> | null;

        if (vRes.error) console.error('Variant batch fetch error', vRes.error);
        if (oRes.error) console.error('Offer batch fetch error', oRes.error);

        if (vData) {
          for (const row of vData) {
            const pid = String(row.product_id);
            const price = row.price != null ? parseFloat(String(row.price)) : null;
            const compare = row.compare_at_price != null ? parseFloat(String(row.compare_at_price)) : null;
            if (!pricingMap[pid]) pricingMap[pid] = { variantPrice: price, compareAtPrice: compare, offerPrice: null };
            else {
              const existing = pricingMap[pid];
              if (price !== null && (existing.variantPrice === null || price < existing.variantPrice)) {
                existing.variantPrice = price;
                existing.compareAtPrice = compare ?? existing.compareAtPrice;
              }
            }
          }
        }

        if (oData) {
          for (const row of oData) {
            const pid = String(row.product_id);
            const price = row.price != null ? parseFloat(String(row.price)) : null;
            if (!pricingMap[pid]) pricingMap[pid] = { variantPrice: null, compareAtPrice: null, offerPrice: price };
            else {
              const existing = pricingMap[pid];
              if (price !== null && (existing.offerPrice === null || price < existing.offerPrice)) {
                existing.offerPrice = price;
              }
            }
          }
        }
      } catch (fallbackErr) {
        console.error('Fallback batch fetch error', fallbackErr);
      }
    };

    // Process in batches, but each batch may itself split on timeouts
    for (let i = 0; i < idsToFetch.length; i += INITIAL_BATCH_SIZE) {
      const chunk = idsToFetch.slice(i, i + INITIAL_BATCH_SIZE);
      await processChunk(chunk);
    }

    // Merge results into state once all chunks processed
    setProductPricings(prev => ({ ...prev, ...pricingMap }));
  }, [productPricings]);
  
  // Debounced pricing fetch
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

  // Request queue for preventing concurrent overload
  const requestQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingRef = useRef(false);
  const currentRequestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const currentRequestKeyRef = useRef<string>('');
  const prefetchCacheRef = useRef<Record<number, { key: string; data: ProductWithDetails[]; count: number }>>({});
  
  // Cache for filter dropdowns
  const filterCacheRef = useRef<Map<string, { data: unknown[]; timestamp: number }>>(new Map());
  // Track in-flight fetch promises to deduplicate concurrent requests for the same key
  const inflightFetchesRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const fetchWithCache = useCallback(async <T,>(
    key: string, 
    fetchFn: () => Promise<T[]>
  ): Promise<T[]> => {
    const cached = filterCacheRef.current.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as T[];
    }
    // If another call for this key is already in-flight, wait for it instead
    const inflight = inflightFetchesRef.current.get(key) as Promise<T[]> | undefined;
    if (inflight) {
      try {
        const data = await inflight;
        return data as T[];
      } catch {
        // fall through to attempt a fresh fetch below
      }
    }

    const promise = (async () => {
      const data = await fetchFn();
      filterCacheRef.current.set(key, { data: data as unknown[], timestamp: Date.now() });
      return data as T[];
    })();

    inflightFetchesRef.current.set(key, promise as Promise<unknown>);
    try {
      const result = await promise;
      return result;
    } finally {
      inflightFetchesRef.current.delete(key);
    }
  }, [CACHE_TTL]);

  // Request queue processor
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
        // Delay between requests to prevent overwhelming the database
        setTimeout(() => {
          if (requestQueueRef.current.length > 0) {
            processQueue();
          }
        }, 100);
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

  // Function to determine which table/view to use based on filters
  const getTableName = useCallback((filters: FilterOptions): string => {
    // Use materialized view only for default/common filters
    const isDefaultFilters = 
      filters.inStockOnly === true &&
      filters.onSaleOnly === false &&
      filters.selectedPriceRange[0] === PRICE_RANGE[0] &&
      filters.selectedPriceRange[1] === PRICE_RANGE[1] &&
      filters.selectedShopName.length === 0 &&
      filters.selectedSizeGroups.length === 0 &&
      !filters.searchQuery;
    
    return isDefaultFilters ? PRODUCTS_MATERIALIZED_VIEW : 'products_with_details';
  }, [PRICE_RANGE]);

  const fetchFilteredProducts = useCallback(
    async (
      filters: FilterOptions,
      page: number,
      sortOrder: 'asc' | 'desc' | 'discount_desc',
      attempt = 1
    ) => {
      // Create a unique request key for deduplication
      const requestKey = `${JSON.stringify(filters)}-${page}-${sortOrder}-${attempt}`;
      
      // Check if same request is already in flight
      if (pendingRequestsRef.current.has(requestKey)) {
        return pendingRequestsRef.current.get(requestKey)!;
      }
      
      const requestPromise = new Promise<void>((resolve, reject) => {
        enqueueRequest(async () => {
          // Only abort previous request for top-level changes (page === 0)
          if (page === 0 && currentRequestRef.current) {
            currentRequestRef.current.abort();
          }

          const controller = new AbortController();
          currentRequestRef.current = controller;
          currentRequestKeyRef.current = requestKey;

          const myRequestId = ++requestIdRef.current;

          setLoading(true);
          
          try {
            if (page > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const cacheKey = JSON.stringify({ filters, sortOrder });
            const cached = prefetchCacheRef.current[page];
            if (cached && cached.key === cacheKey) {
              if (myRequestId !== requestIdRef.current) return;

              startTransition(() => {
                setProducts(prev => 
                  page === 0 
                    ? (cached.data || []) 
                    : mergeUniqueProducts(prev, (cached.data as unknown as ProductWithDetails[]) || [])
                );
              });
              
              {
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
              }
              
              setHasMore((page + 1) * ITEMS_PER_PAGE < (cached.count || 0));
              setInitialLoad(false);
              setError(null);

              // Prefetch next page
              if ((page + 1) * ITEMS_PER_PAGE < (cached.count || 0)) {
                scheduleIdle(() => {
                  (async () => {
                    try {
                      const tableName = getTableName(filters);
                      const supabase = getSupabase();
                      let prefetchQuery = supabase
                        .from(tableName)
                        .select('id,title,shop_name,created_at,url,description,in_stock,min_price,max_discount_percentage,on_sale,size_groups,images,product_type,tags,vendor,handle', { 
                          count: 'exact',
                          head: false 
                        })
                        .limit(ITEMS_PER_PAGE);

                      if (tableName === 'products_with_details') {
                        if (filters.selectedShopName.length > 0) {
                          const ids = Array.from(new Set(filters.selectedShopName.map(s => Number(s)).filter(n => !Number.isNaN(n) && n > 0)));
                          if (ids.length > 0) prefetchQuery = prefetchQuery.in('shop_id', ids);
                        }
                        if (filters.inStockOnly) prefetchQuery = prefetchQuery.eq('in_stock', true);
                        if (filters.onSaleOnly) prefetchQuery = prefetchQuery.eq('on_sale', true);
                        if (filters.searchQuery) prefetchQuery = prefetchQuery.textSearch('fts', filters.searchQuery, { type: 'plain', config: 'english' });
                        if (filters.selectedPriceRange) prefetchQuery = prefetchQuery.gte('min_price', filters.selectedPriceRange[0]).lte('min_price', filters.selectedPriceRange[1]);
                        if (filters.selectedSizeGroups.length > 0) prefetchQuery = prefetchQuery.overlaps('size_groups', filters.selectedSizeGroups);
                      } else {
                        // Materialized view may not enforce the default price range — apply range and on-sale here too.
                        if (filters.selectedPriceRange) {
                          prefetchQuery = prefetchQuery.gte('min_price', filters.selectedPriceRange[0]).lte('min_price', filters.selectedPriceRange[1]);
                        }
                        if (filters.onSaleOnly) {
                          prefetchQuery = prefetchQuery.eq('on_sale', true);
                        }
                      }

                      if (sortOrder === 'discount_desc') {
                        prefetchQuery = prefetchQuery.order('max_discount_percentage', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
                      } else {
                        prefetchQuery = prefetchQuery.order('min_price', { ascending: sortOrder === 'asc' }).order('created_at', { ascending: false });
                      }

                      const { data: pData, count: pCount, error: pError } = await prefetchQuery.range((page + 1) * ITEMS_PER_PAGE, (page + 2) * ITEMS_PER_PAGE - 1);
                      if (!pError && pData) {
                        prefetchCacheRef.current[page + 1] = { key: cacheKey, data: pData as unknown as ProductWithDetails[], count: pCount || 0 };
                      }
                    } catch {
                      // silent
                    }
                  })();
                });
              }

              if (!controller.signal.aborted) setLoading(false);
              resolve();
              return;
            }

            const supabase = getSupabase();
            const tableName = getTableName(filters);

            // Only select columns actually used in the UI
            let query = supabase
              .from(tableName)
              .select('id,title,shop_name,created_at,url,description,in_stock,min_price,max_discount_percentage,on_sale,size_groups,images,product_type,tags,vendor,handle', { 
                count: 'exact',
                head: false
              })
              .limit(ITEMS_PER_PAGE)
              .abortSignal(controller.signal);

            // Apply filters only if using the full view
            if (tableName === 'products_with_details') {
              if (filters.selectedShopName.length > 0) {
                const ids = Array.from(new Set(filters.selectedShopName.map(s => Number(s)).filter(n => !Number.isNaN(n) && n > 0)));
                if (ids.length > 0) query = query.in('shop_id', ids);
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
              } else {
                // Materialized view may not reliably enforce the default price range,
                // so always apply the selected price range and the on-sale filter here too.
                if (filters.selectedPriceRange) {
                  query = query
                    .gte('min_price', filters.selectedPriceRange[0])
                    .lte('min_price', filters.selectedPriceRange[1]);
                }

                if (filters.onSaleOnly) {
                  query = query.eq('on_sale', true);
                }
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

            if (currentRequestKeyRef.current !== requestKey) {
              resolve();
              return;
            }

            if (error) {
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
              
            startTransition(() => {
              setProducts(prev => 
                page === 0 
                  ? (data as unknown as ProductWithDetails[]) || [] 
                  : mergeUniqueProducts(prev, (data as unknown as ProductWithDetails[] || []))
              );
            });
            
            {
              const ids = ((data as unknown as ProductWithDetails[]) || []).map(p => p.id).filter(Boolean);
              const idsToFetch = page === 0 ? ids.slice(0, 12) : ids;
              if (idsToFetch.length > 0) {
                // Fetch pricing for LCP candidates immediately so discount badges
                // and accurate prices appear quickly when sorting or changing filters.
                const lcpIds = idsToFetch.slice(0, LCP_PRELOAD_COUNT);
                if (lcpIds.length > 0) {
                  fetchBatchPricingFor(lcpIds).catch(e => console.error('Error fetching LCP batch pricing for page items', e));
                }

                // Fetch remaining page items at low priority to avoid blocking
                const rest = idsToFetch.slice(LCP_PRELOAD_COUNT);
                if (rest.length > 0) {
                  scheduleIdle(() => {
                    fetchBatchPricingFor(rest).catch(e => console.error('Error fetching batch pricing for page items', e));
                  });
                }
              }
            }
            
            setHasMore(moreAvailable);
            setInitialLoad(false);
            setError(null);

            const cacheKeyCurrent = JSON.stringify({ filters, sortOrder });
            prefetchCacheRef.current[page] = { key: cacheKeyCurrent, data: (data as unknown as ProductWithDetails[]) || [], count: totalItems };

            // Prefetch next page
            if (moreAvailable) {
              scheduleIdle(() => {
                (async () => {
                  try {
                    const nextPageTableName = getTableName(filters);
                    const supabase = getSupabase();
                    let prefetchQuery = supabase
                      .from(nextPageTableName)
                      .select('id,title,shop_name,created_at,url,description,in_stock,min_price,max_discount_percentage,on_sale,size_groups,images,product_type,tags,vendor,handle', { 
                        count: 'exact', 
                        head: false 
                      })
                      .limit(ITEMS_PER_PAGE);

                    if (nextPageTableName === 'products_with_details') {
                      if (filters.selectedShopName.length > 0) {
                        const ids = Array.from(new Set(filters.selectedShopName.map(s => Number(s)).filter(n => !Number.isNaN(n) && n > 0)));
                        if (ids.length > 0) prefetchQuery = prefetchQuery.in('shop_id', ids);
                      }
                      if (filters.inStockOnly) prefetchQuery = prefetchQuery.eq('in_stock', true);
                      if (filters.onSaleOnly) prefetchQuery = prefetchQuery.eq('on_sale', true);
                      if (filters.searchQuery) prefetchQuery = prefetchQuery.textSearch('fts', filters.searchQuery, { type: 'plain', config: 'english' });
                      if (filters.selectedPriceRange) prefetchQuery = prefetchQuery.gte('min_price', filters.selectedPriceRange[0]).lte('min_price', filters.selectedPriceRange[1]);
                      if (filters.selectedSizeGroups.length > 0) prefetchQuery = prefetchQuery.overlaps('size_groups', filters.selectedSizeGroups);
                    } else {
                      // Materialized view may not enforce the default price range — apply range and on-sale here too.
                      if (filters.selectedPriceRange) {
                        prefetchQuery = prefetchQuery.gte('min_price', filters.selectedPriceRange[0]).lte('min_price', filters.selectedPriceRange[1]);
                      }
                      if (filters.onSaleOnly) {
                        prefetchQuery = prefetchQuery.eq('on_sale', true);
                      }
                    }

                    if (sortOrder === 'discount_desc') {
                      prefetchQuery = prefetchQuery.order('max_discount_percentage', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
                    } else {
                      prefetchQuery = prefetchQuery.order('min_price', { ascending: sortOrder === 'asc' }).order('created_at', { ascending: false });
                    }

                    const { data: pData, count: pCount, error: pError } = await prefetchQuery.range((page + 1) * ITEMS_PER_PAGE, (page + 2) * ITEMS_PER_PAGE - 1);
                    if (!pError && pData) {
                      prefetchCacheRef.current[page + 1] = { key: cacheKeyCurrent, data: pData as unknown as ProductWithDetails[], count: pCount || 0 };
                    }
                  } catch {
                    // silent
                  }
                })();
              });
            }

            resolve();

          } catch (error: unknown) {
            if (error instanceof Error && error.name !== 'AbortError') {
              console.error('Fetch error:', error);
              
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
              startTransition(() => {
                setProducts([]);
              });
              setHasMore(false);
              reject(error);
            }
          } finally {
            if (!controller.signal.aborted) {
              setLoading(false);
            }
            // Clean up from pending requests
            pendingRequestsRef.current.delete(requestKey);
          }
        });
      });
      
      pendingRequestsRef.current.set(requestKey, requestPromise);
      return requestPromise;
    },
    [fetchBatchPricingFor, scheduleIdle, mergeUniqueProducts, enqueueRequest, getTableName]
  );

  // Update shop names to use caching
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const supabase = getSupabase();

        // Fetch distinct shops (id + name) from materialized view for performance
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
      
        // Fetch size data with cache
        const sizeData = await fetchWithCache('size_groups', async () => {
          const { data, error } = await supabase
            .from('distinct_size_groups_mv') // Use materialized view for size groups
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

  // After we load the shop list, reconcile any saved shop names (legacy) to their IDs.
  useEffect(() => {
    if (!shopList || shopList.length === 0) return;

    // If selectedShopName contains non-numeric values (previously stored names), map them to ids
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

  // Commit vs UI (pending) filters
  const [committedFilters, setCommittedFilters] = useState<FilterOptions>(() => ({
    selectedShopName,
    selectedSizeGroups,
    inStockOnly,
    onSaleOnly,
    searchQuery,
    selectedPriceRange,
  }));

  // Debounced commit (immediate UI updates, but wait before requesting)
  const commitFiltersDebounced = useRef(createDebounced((filters: FilterOptions) => {
    setCommittedFilters(filters);
  }, 700)).current;

  // Create stable keys for complex dependencies so the effect deps can be statically checked
  const selectedShopNameKey = useMemo(() => JSON.stringify(selectedShopName), [selectedShopName]);
  const selectedSizeGroupsKey = useMemo(() => JSON.stringify(selectedSizeGroups), [selectedSizeGroups]);
  const selectedPriceRangeKey = useMemo(() => JSON.stringify(selectedPriceRange), [selectedPriceRange]);

  // Reset page when committed filters or sort order change.
  const committedFiltersKey = useMemo(() => JSON.stringify(committedFilters), [committedFilters]);
  
  // FIXED: Simplified filter commitment logic
  useEffect(() => {
    // Create a single, stable pending filters object
    const pendingFilters = {
      selectedShopName: JSON.parse(selectedShopNameKey),
      selectedSizeGroups: JSON.parse(selectedSizeGroupsKey),
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange: JSON.parse(selectedPriceRangeKey) as [number, number],
    };

    const pendingKey = JSON.stringify(pendingFilters);

    // Only update if truly different
    if (pendingKey === committedFiltersKey) return;

    // Cancel previous debounce
    if (commitFiltersDebounced.cancel) {
      commitFiltersDebounced.cancel();
    }

    // Update immediately for initial load, debounce for subsequent changes
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

  
  useEffect(() => {
    setPage(0);
  }, [committedFiltersKey, sortOrder]);

  // Fetch whenever committed filters, sortOrder or page change.
  useEffect(() => {
    // Abort previous request for top-level changes
    if (currentRequestRef.current) {
      currentRequestRef.current.abort();
    }

    if (page === 0) {
      setProducts([]);
      setInitialLoad(true);
    }

    fetchFilteredProducts(committedFilters, page, sortOrder).catch(err => {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('Error:', err);
      }
    });
  }, [committedFiltersKey, sortOrder, page, fetchFilteredProducts, committedFilters]);

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

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && hasMore && !initialLoad && products.length > 0) {
          setPage(prev => prev + 1);
        }
      },
      { rootMargin: '600px 0px' }
    );

    const currentRef = observerRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [loading, hasMore, initialLoad, products.length]);

  // Cleanup on unmount
  useEffect(() => {
    // Capture ref.current values here so the cleanup uses the same objects
    const capturedPendingRequests = pendingRequestsRef.current;
    const capturedInflightFetches = inflightFetchesRef.current;
    const capturedCommitCancel = commitFiltersDebounced?.cancel;
    // Type-safe access to optional `cancel` on the debounced function
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

      // Clear captured containers rather than accessing ref.current directly,
      // and reset the live refs to empty structures to avoid retaining references.
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

      // Reset the live refs to fresh empty containers to avoid holding onto stale data.
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


  // Accept simple string value from our `SingleSelectDropdown` component.
  const handleSortChange = (value: string) => {
    const parsed = value as 'asc' | 'desc' | 'discount_desc';
    setSortOrder(parsed);

    // Immediately commit current UI filters so the sort is applied together
    // with the latest (possibly uncommitted) filter UI state such as On Sale.
    const pendingFilters: FilterOptions = {
      selectedShopName,
      selectedSizeGroups,
      inStockOnly,
      onSaleOnly,
      searchQuery,
      selectedPriceRange,
    };

    // Cancel any pending debounce and commit right away to ensure fetch uses
    // the currently visible filter toggles.
    if (commitFiltersDebounced?.cancel) commitFiltersDebounced.cancel();
    setCommittedFilters(pendingFilters);
    // Reset to first page when changing sort
    setPage(0);
  };

  // Called when the user finishes dragging / releases the slider handle.
  const handleSliderChangeEnd = (values: number[]) => {
    const [minValue, maxValue] = values;
    setSelectedPriceRange([minValue, maxValue]);
    // Commit immediately on drag end
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
      // Allow users to enter values below the default PRICE_RANGE[0], but clamp to ABS_MIN_PRICE
      const newMin = Math.min(Math.max(numericValue, ABS_MIN_PRICE), selectedPriceRange[1]);
      setSelectedPriceRange([newMin, selectedPriceRange[1]]);
    } else {
      // Allow values above default PRICE_RANGE[1], but clamp to ABS_MAX_PRICE
      const newMax = Math.max(Math.min(numericValue, ABS_MAX_PRICE), selectedPriceRange[0]);
      setSelectedPriceRange([selectedPriceRange[0], newMax]);
    }
  };
  
  const getCurrentSizeOptions = () => {
    const filteredSizes = allSizeData;
    
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

  const handleClearAllFilters = () => {
    setSelectedShopName([]);
    setInStockOnly(true);
    setOnSaleOnly(false);
    setSelectedSizeGroups([]);
    setSelectedPriceRange([...PRICE_RANGE]);
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
          {/* Vertical Filters Sidebar - Mobile Toggle */}
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
  
            {/* Filters Container */}
            <div className={`${showFilters ? 'block' : 'hidden'} lg:block lg:sticky lg:top-24 lg:self-start`}>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 space-y-4 sm:p-4 sm:space-y-6 max-h-[calc(100vh-6rem)] overflow-auto pr-2 lg:mr-4">
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
                  onChange={handleSortChange}
                  placeholder="Featured"
                />
              </div>
            </div>

  
            {/* Products List */}
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