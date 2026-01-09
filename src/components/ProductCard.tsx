import { useMemo, useState, memo, useLayoutEffect, useRef, useEffect } from 'react';
import AsyncLucideIcon from './AsyncLucideIcon';
import { ProductWithDetails } from '../types';
import { useNavigate } from 'react-router-dom';
import { useProductPricing } from '../hooks/useProductPricing';
import { getSupabase } from '../lib/supabase';
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
  const navigate = useNavigate();
  
  // Use pricing passed from parent to avoid per-card network requests
  const pricingFromHook = useProductPricing(product.id, !pricing);
  const variantPrice = pricing?.variantPrice ?? pricingFromHook.variantPrice;
  const compareAtPrice = pricing?.compareAtPrice ?? pricingFromHook.compareAtPrice;
  const offerPrice = pricing?.offerPrice ?? pricingFromHook.offerPrice;

  // Get the first image data
  const firstImageRecord = product.images?.[0] as Record<string, unknown> | undefined;
  const imageSrc = firstImageRecord?.src as string | undefined;
  const baseUrlId = firstImageRecord?.base_url_id as number | undefined;
  const filePath = firstImageRecord?.file_path as string | undefined;
  const dbWidth = firstImageRecord?.width as number | undefined;
  const dbHeight = firstImageRecord?.height as number | undefined;
  const dbAlt = firstImageRecord?.alt as string | undefined;

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Fetch base URL if needed
  useEffect(() => {
    if (!baseUrlId) return;
    
    const fetchBaseUrl = async () => {
      try {
        const supabase = await getSupabase();
        const { data } = await supabase
          .from('image_base_urls')
          .select('base_url')
          .eq('id', baseUrlId)
          .single();
        
        if (data) {
          setBaseUrl(data.base_url);
        }
      } catch (error) {
        console.error('Error fetching base URL:', error);
      }
    };

    fetchBaseUrl();
  }, [baseUrlId]);

  // Build image URL and srcsets
  const { finalSrc, finalSrcSet, finalWebpSrcSet } = useMemo(() => {
    // If we have a complete src URL, use it directly
    if (imageSrc && imageSrc.startsWith('http')) {
      const buildSrcSets = (url: string) => {
        try {
          const sizes = [220, 440, 880];
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

          const fallbackParams = new URLSearchParams(originalParams.toString());
          fallbackParams.set('width', '220');
          const src = `${base}?${fallbackParams.toString()}`;

          return { src, srcSet, webpSrcSet };
        } catch {
          return { src: url, srcSet: undefined, webpSrcSet: undefined };
        }
      };

      const { src, srcSet, webpSrcSet } = buildSrcSets(imageSrc);
      return { finalSrc: src, finalSrcSet: srcSet, finalWebpSrcSet: webpSrcSet };
    }

    // If we have base_url and file_path, construct the URL
    if (baseUrl && filePath) {
      const fullUrl = `${baseUrl}${filePath}`;
      
      const buildSrcSets = (url: string) => {
        try {
          const sizes = [220, 440, 880];
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

          const fallbackParams = new URLSearchParams(originalParams.toString());
          fallbackParams.set('width', '220');
          const src = `${base}?${fallbackParams.toString()}`;

          return { src, srcSet, webpSrcSet };
        } catch {
          return { src: url, srcSet: undefined, webpSrcSet: undefined };
        }
      };

      const { src, srcSet, webpSrcSet } = buildSrcSets(fullUrl);
      return { finalSrc: src, finalSrcSet: srcSet, finalWebpSrcSet: webpSrcSet };
    }

    return { finalSrc: undefined, finalSrcSet: undefined, finalWebpSrcSet: undefined };
  }, [imageSrc, baseUrl, filePath]);

  const sizesAttr = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 316px';

  const imgRef = useRef<HTMLImageElement | null>(null);

  // Preload LCP candidate image synchronously before paint
  useLayoutEffect(() => {
    if (!isLcp || typeof document === 'undefined' || !finalSrc) return;

    try {
      const url = finalSrc;
      const selector = `link[rel="preload"][href="${url}"]`;
      const existing = document.head.querySelector(selector);
      
      if (!existing) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        
        if (finalWebpSrcSet || finalSrcSet) {
          link.setAttribute('imagesrcset', finalWebpSrcSet || finalSrcSet || '');
          link.setAttribute('imagesizes', sizesAttr);
        }
        
        link.setAttribute('fetchpriority', 'high');
        
        if (document.head.firstChild) {
          document.head.insertBefore(link, document.head.firstChild);
        } else {
          document.head.appendChild(link);
        }
      }

      if (imgRef.current) {
        imgRef.current.setAttribute('fetchpriority', 'high');
      }
    } catch (err) {
      console.error('Preload error:', err);
    }
  }, [isLcp, finalSrc, finalWebpSrcSet, finalSrcSet, sizesAttr]);

  // Process variants from the product data
  const processedVariants = useMemo(() => {
    const fromVariants = (product.variants || [])
      .filter((variant: unknown): variant is { title: string; available?: unknown } =>
        typeof variant === 'object' &&
        variant !== null &&
        'title' in variant &&
        typeof (variant as Record<string, unknown>).title === 'string' &&
        (variant as Record<string, unknown>).title !== 'Default Title'
      )
      .map((variant) => ({
        title: variant.title,
        available: Boolean(variant.available),
      }));

    if (fromVariants.length > 0) return fromVariants;

    const sizes = (product.size_groups || []) as string[];
    if (Array.isArray(sizes) && sizes.length > 0) {
      return sizes.filter(Boolean).map(s => ({ title: String(s), available: true }));
    }

    return [] as { title: string; available: boolean }[];
  }, [product.variants, product.size_groups]);

  const allVariantsUnavailable = useMemo(
    () => processedVariants.length > 0 && processedVariants.every(v => !v.available),
    [processedVariants]
  );

  const isAvailable = product.in_stock && !allVariantsUnavailable;

  const handleCardClick = () => {
    navigate(`/products/${product.id}`);
  };

  const discountPercentage = useMemo(() => {
    if (typeof compareAtPrice === 'number' && compareAtPrice > 0) {
      const price = (offerPrice ?? variantPrice) ?? 0;
      if (price > 0) {
        return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
      }
    }
    if (typeof product.max_discount_percentage === 'number' && product.max_discount_percentage > 0) {
      return Math.round(product.max_discount_percentage);
    }
    return 0;
  }, [compareAtPrice, variantPrice, offerPrice, product.max_discount_percentage]);

  const hasDiscount = useMemo(() => {
    if (compareAtPrice && (compareAtPrice > ((offerPrice ?? variantPrice) ?? 0))) return true;
    return typeof product.max_discount_percentage === 'number' && product.max_discount_percentage > 0;
  }, [compareAtPrice, variantPrice, offerPrice, product.max_discount_percentage]);

  const availableVariantsCount = useMemo(() => 
    processedVariants.filter(v => v.available).length,
    [processedVariants]
  );

  return (
    <div
      className="relative flex flex-col bg-white dark:bg-gray-800 rounded-md shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden product-card group"
      onClick={handleCardClick}
    >
      {/* Discount Badge */}
      {hasDiscount && (
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

      {/* Image Container - Fixed aspect ratio */}
      <div className="relative w-full pt-[56%] sm:pt-[70%] overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0 rounded-t-md">
        {finalSrc ? (
          <picture>
            {finalWebpSrcSet && (
              <source type="image/webp" srcSet={finalWebpSrcSet} sizes={sizesAttr} />
            )}

            {finalSrcSet && (
              <source srcSet={finalSrcSet} sizes={sizesAttr} />
            )}

            <img
              src={finalSrc}
              srcSet={finalSrcSet}
              sizes={sizesAttr}
              loading={isLcp ? 'eager' : 'lazy'}
              decoding={isLcp ? 'sync' : 'async'}
              alt={dbAlt || product.title || 'Product image'}
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
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
            <span className="text-gray-400 text-sm">No Image</span>
          </div>
        )}
      </div>

      {/* Product Info - Fixed structure for alignment */}
      <div className="flex flex-col p-1.5 sm:p-3 pb-3 sm:pb-4">
        {/* Shop Name - Fixed height */}
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1 truncate h-4">
          {product.shop_name}
        </p>

        {/* Title and External Link - Fixed height */}
        <div className="flex items-start justify-between mb-1 sm:mb-2 h-10 sm:h-11">
          <h3
            className={`text-sm font-medium text-gray-900 dark:text-gray-100 text-left line-clamp-2 flex-grow mr-2 ${
              !isAvailable ? 'line-through' : ''
            }`}
          >
            {product.title}
          </h3>
          <a
            href={product.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 mt-0.5"
            onClick={(e) => e.stopPropagation()}
            title="View on original site"
          >
            <AsyncLucideIcon name="ExternalLink" className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>
        </div>

        {/* Variants - Fixed height section, always present */}
        <div className="mb-2 h-6 flex items-center">
          {availableVariantsCount > 0 && !allVariantsUnavailable ? (
            <div className="flex items-center gap-1">
              {processedVariants
                .filter(v => v.available)
                .slice(0, 2)
                .map((variant, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center text-xs px-2 py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    title={variant.title}
                  >
                    <span className="truncate max-w-[50px]">{variant.title}</span>
                  </span>
                ))}
              
              {availableVariantsCount > 2 && (
                <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  +{availableVariantsCount - 2}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 invisible">
              placeholder
            </span>
          )}
        </div>

        {/* Price Information - Fixed height, always aligned */}
        <div className="h-6 flex items-center">
          <div className="flex items-baseline gap-1">
            <span className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
              ${offerPrice?.toFixed(2) ?? variantPrice?.toFixed(2) ?? product.min_price?.toFixed(2) ?? '0.00'}
            </span>
            {compareAtPrice && compareAtPrice > ((offerPrice ?? variantPrice) ?? 0) && (
              <span className="text-xs text-gray-500 dark:text-gray-400 line-through whitespace-nowrap">
                ${compareAtPrice.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ProductCard = memo(ProductCardComponent);