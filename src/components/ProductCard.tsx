import { useMemo, useState, memo, useLayoutEffect, useRef } from 'react';
import AsyncLucideIcon from './AsyncLucideIcon';
import { ProductWithDetails } from '../types';
import { useNavigate } from 'react-router-dom';
import { useProductPricing } from '../hooks/useProductPricing';
import '../index.css';

interface ProductCardProps {
  product: ProductWithDetails;
  pricing?: {
    variantPrice: number | null;
    compareAtPrice: number | null;
    offerPrice: number | null;
  };
  isLcp?: boolean;
}

function ProductCardComponent({ product, pricing, isLcp }: ProductCardProps) {
  const [showAllVariants, setShowAllVariants] = useState(false);
  const navigate = useNavigate();
  
  // Use pricing passed from parent to avoid per-card network requests
  const pricingFromHook = useProductPricing(product.id, !pricing);
  const variantPrice = pricing?.variantPrice ?? pricingFromHook.variantPrice;
  const compareAtPrice = pricing?.compareAtPrice ?? pricingFromHook.compareAtPrice;
  const offerPrice = pricing?.offerPrice ?? pricingFromHook.offerPrice;

  // Get the first image as the product image
  const [productImage] = useState(() => 
    product.images?.[0]?.src || null
  );

  // Track when the main image has loaded to hide the placeholder
  const [imgLoaded, setImgLoaded] = useState(false);

  // Prefer responsive fields produced by the scraping pipeline if available
  const firstImageRecord = product.images?.[0] as Record<string, unknown> | undefined;
  const dbFallback = firstImageRecord ? (firstImageRecord['responsive_fallback'] as string | undefined) : undefined;
  const dbSrcSet = firstImageRecord ? (firstImageRecord['srcset'] as string | undefined) : undefined;
  const dbWebpSrcSet = firstImageRecord ? (firstImageRecord['webp_srcset'] as string | undefined) : undefined;
  const dbPlaceholder = firstImageRecord ? (firstImageRecord['placeholder'] as string | undefined) : undefined;
  const dbWidth = firstImageRecord ? (firstImageRecord['width'] as number | undefined) : undefined;
  const dbHeight = firstImageRecord ? (firstImageRecord['height'] as number | undefined) : undefined;

  // Choose the best source candidate
  const sourceCandidate = dbFallback || (productImage ?? undefined);

  // Helper: build srcset strings for an image URL using common widths
  const buildSrcSets = useMemo(() => {
    return (url?: string) => {
      if (!url) return { src: undefined as string | undefined, srcSet: undefined as string | undefined, webpSrcSet: undefined as string | undefined };
      try {
        // CRITICAL: Use smaller sizes optimized for card rendering
        // Card renders ~316px on desktop; target 1x, 1.5x, and 2x DPR
        const sizes = [316, 474, 632];
        const parsed = new URL(url);
        const base = parsed.origin + parsed.pathname;
        const originalParams = parsed.searchParams;

        const srcSet = sizes
          .map((w) => {
            const p = new URLSearchParams(originalParams.toString());
            p.set('width', String(w));
            return `${base}?${p.toString()} ${w}w`;
          })
          .join(', ');

        const webpSrcSet = sizes
          .map((w) => {
            const p = new URLSearchParams(originalParams.toString());
            p.set('width', String(w));
            p.set('format', 'webp');
            return `${base}?${p.toString()} ${w}w`;
          })
          .join(', ');

        // CRITICAL: Use card width (316px) as fallback, not 2x size
        const fallbackParams = new URLSearchParams(originalParams.toString());
        fallbackParams.set('width', String(316));
        const src = `${base}?${fallbackParams.toString()}`;

        return { src, srcSet, webpSrcSet };
      } catch {
        return { src: url, srcSet: undefined, webpSrcSet: undefined };
      }
    };
  }, []);

  // Build responsive srcsets from the source candidate
  const { src: computedSrc, srcSet: computedSrcSet, webpSrcSet: computedWebpSrcSet } = useMemo(
    () => buildSrcSets(sourceCandidate || undefined),
    [buildSrcSets, sourceCandidate]
  );

  // Final sources to use in <picture>
  const finalFallback = computedSrc || sourceCandidate || productImage || undefined;
  const finalSrcSet = dbSrcSet || computedSrcSet;
  const finalWebpSrcSet = dbWebpSrcSet || computedWebpSrcSet;

  // CRITICAL: Accurate sizes attribute for proper image selection
  const sizesAttr = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 316px';

  const imgRef = useRef<HTMLImageElement | null>(null);

  // CRITICAL: Preload LCP candidate image synchronously before paint
  useLayoutEffect(() => {
    if (!isLcp || typeof document === 'undefined' || !finalFallback) return;

    try {
      const url = finalFallback;
      const selector = `link[rel="preload"][href="${url}"]`;
      const existing = document.head.querySelector(selector);
      
      if (!existing) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        
        // CRITICAL: Include srcset for responsive preloading
        if (finalWebpSrcSet || finalSrcSet) {
          // Prefer WebP srcset if available (better compression)
          link.setAttribute('imagesrcset', finalWebpSrcSet || finalSrcSet || '');
          link.setAttribute('imagesizes', sizesAttr);
        }
        
        // CRITICAL: High priority for LCP image
        link.setAttribute('fetchpriority', 'high');
        
        // Insert at beginning of head for earliest discovery
        if (document.head.firstChild) {
          document.head.insertBefore(link, document.head.firstChild);
        } else {
          document.head.appendChild(link);
        }
      }

      // CRITICAL: Set fetchpriority directly on img element
      if (imgRef.current) {
        imgRef.current.setAttribute('fetchpriority', 'high');
      }
    } catch (err) {
      console.error('Preload error:', err);
    }

    // Cleanup not needed - preload hints can persist
  }, [isLcp, finalFallback, finalWebpSrcSet, finalSrcSet, sizesAttr]);

  // Process variants from the product data
  const variants = useMemo(() => 
    (product.variants || [])
      .filter(variant => variant.title !== 'Default Title')
      .map(variant => ({
        title: variant.title,
        available: variant.available,
      })),
    [product.variants]
  );

  // Determine if all variants are unavailable
  const allVariantsUnavailable = useMemo(() => 
    variants.length > 0 && variants.every(variant => !variant.available),
    [variants]
  );

  // Determine product availability
  const isAvailable = product.in_stock && !allVariantsUnavailable;

  const handleCardClick = () => {
    navigate(`/products/${product.id}`);
  };

  const discountPercentage = useMemo(() => 
    compareAtPrice && variantPrice 
    ? Math.round(((compareAtPrice - (offerPrice ?? variantPrice)) / compareAtPrice * 100))
    : 0,
    [compareAtPrice, variantPrice, offerPrice]
  );

  // CRITICAL: Read viewport width once to avoid layout thrashing
  const initialViewportWidth = useMemo(() => 
    (typeof window !== 'undefined' ? window.innerWidth : 1024), 
  []);

  // Limit displayed variants
  const displayedVariants = useMemo(
    () => (showAllVariants ? variants : variants.slice(0, initialViewportWidth < 768 ? 2 : 3)),
    [variants, showAllVariants, initialViewportWidth]
  );

  const hasHiddenVariants = useMemo(
    () => variants.length > (initialViewportWidth < 768 ? 2 : 3) && !showAllVariants,
    [variants, showAllVariants, initialViewportWidth]
  );

  return (
    <div
      className={`relative flex flex-col h-full bg-white dark:bg-gray-800 rounded-md shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden ${
        !isAvailable ? 'opacity-80' : ''
      }`}
      onClick={handleCardClick}
      style={{ margin: '0 5px' }}
    >
      {/* Discount Badge */}
      {compareAtPrice && compareAtPrice > ((offerPrice ?? variantPrice) ?? 0) && (
        <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10">
          {discountPercentage}% OFF
        </div>
      )}

      {/* Availability Badge */}
      {!isAvailable && (
        <div className="absolute top-2 right-2 bg-gray-800 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10">
          {!product.in_stock ? 'OUT OF STOCK' : 'UNAVAILABLE'}
        </div>
      )}

      {/* Image Container */}
      <div className="relative w-full pt-[100%] sm:pt-[70%] overflow-hidden">
        {productImage ? (
          <picture>
            {/* CRITICAL: WebP first for best compression */}
            {finalWebpSrcSet && (
              <source type="image/webp" srcSet={finalWebpSrcSet} sizes={sizesAttr} />
            )}

            {finalSrcSet && (
              <source srcSet={finalSrcSet} sizes={sizesAttr} />
            )}

            {/* CRITICAL: Placeholder LQIP for perceived performance */}
            {dbPlaceholder && (
              <img
                src={dbPlaceholder}
                alt=""
                aria-hidden="true"
                className={`absolute top-0 left-0 w-full h-full object-cover filter blur-sm scale-105 transition-opacity duration-300 ${
                  imgLoaded ? 'opacity-0' : 'opacity-100'
                }`}
              />
            )}

            {/* CRITICAL: Main image with optimized attributes */}
            <img
              src={finalFallback}
              srcSet={finalSrcSet}
              sizes={sizesAttr}
              loading={isLcp ? 'eager' : 'lazy'}
              decoding={isLcp ? 'sync' : 'async'}
              alt={product.title || 'Product image'}
              width={dbWidth}
              height={dbHeight}
              ref={imgRef}
              className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgLoaded(true)}
            />
          </picture>
        ) : (
          <div className="absolute top-0 left-0 w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-gray-400">No Image</span>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-2 sm:p-3 flex flex-col flex-grow">
        {/* Shop Name */}
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
          {product.shop_name}
        </p>

        {/* Title and External Link */}
        <div className="flex items-start justify-between mb-1 sm:mb-2">
          <h3
            className={`text-sm font-medium text-gray-900 dark:text-gray-100 text-left line-clamp-2 ${
              !isAvailable ? 'line-through' : ''
            }`}
          >
            {product.title}
          </h3>
          <a
            href={product.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            title="View on original site"
          >
            <AsyncLucideIcon name="ExternalLink" className="w-3 h-3 sm:w-4 sm:h-4" />
          </a>
        </div>

        {/* Price Information */}
        <div className="mt-auto">
          <div className="flex items-baseline gap-1">
            <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
              ${offerPrice?.toFixed(2) ?? variantPrice?.toFixed(2) ?? product.min_price?.toFixed(2) ?? '0.00'}
            </span>
            {compareAtPrice && compareAtPrice > ((offerPrice ?? variantPrice) ?? 0) && (
              <span className="text-xs text-gray-500 dark:text-gray-400 line-through">
                ${compareAtPrice.toFixed(2)}
              </span>
            )}
          </div>

          {/* Variants */}
          {variants.length > 0 && (
            <div className="mt-1 sm:mt-2">
              <div className="flex flex-wrap gap-1">
                {displayedVariants.map((variant, index) => (
                  <span
                    key={index}
                    className={`text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full border ${
                      variant.available
                        ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {variant.title}
                  </span>
                ))}
                {hasHiddenVariants && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllVariants(true);
                    }}
                    className="text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    +{variants.length - (initialViewportWidth < 768 ? 2 : 3)} more
                  </button>
                )}
                {showAllVariants && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAllVariants(false);
                    }}
                    className="text-xs px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ProductCard = memo(ProductCardComponent);