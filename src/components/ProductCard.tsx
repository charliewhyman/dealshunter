import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ProductWithDetails } from '../types';
import { useNavigate } from 'react-router-dom';
import { useProductPricing } from '../hooks/useProductPricing';
import '../index.css';

interface ProductCardProps {
  product: ProductWithDetails;
}

export function ProductCard({ product }: ProductCardProps) {
  const [showAllVariants, setShowAllVariants] = useState(false);
  const navigate = useNavigate();
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(product.id);

  // Get the first image as the product image
  const [productImage, setProductImage] = useState(() => 
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

  // Helper: build srcset strings for an image URL using common widths.
  // For many CDNs (including Shopify's CDN) adding a `width` query param
  // returns a resized image. We also build a WebP variant via `format=webp`.
  const buildSrcSets = (url?: string) => {
    if (!url) return { src: undefined as string | undefined, srcSet: undefined as string | undefined, webpSrcSet: undefined as string | undefined };
    try {
      const sizes = [320, 480, 640, 960, 1280, 1600];
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
      fallbackParams.set('width', String(640));
      const src = `${base}?${fallbackParams.toString()}`;

      return { src, srcSet, webpSrcSet };
    } catch {
      return { src: url, srcSet: undefined, webpSrcSet: undefined };
    }
  };

  const { src: responsiveSrc, srcSet: responsiveSrcSet, webpSrcSet } = buildSrcSets(productImage || undefined);

  // Final sources we will use in the <picture>
  const finalFallback = dbFallback || responsiveSrc || productImage || undefined;
  const finalSrcSet = dbSrcSet || responsiveSrcSet;
  const finalWebpSrcSet = dbWebpSrcSet || webpSrcSet;

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

  // Limit displayed variants to 2 on mobile, 3 on desktop unless showAllVariants is true
  const displayedVariants = useMemo(() => 
    showAllVariants ? variants : variants.slice(0, window.innerWidth < 768 ? 2 : 3),
    [variants, showAllVariants]
  );

  const hasHiddenVariants = useMemo(() =>
    variants.length > (window.innerWidth < 768 ? 2 : 3) && !showAllVariants,
    [variants, showAllVariants]
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
            {finalWebpSrcSet && (
              <source type="image/webp" srcSet={finalWebpSrcSet} />
            )}

            {/* placeholder LQIP: low-res tiny image that stays blurred until main img loads */}
            {dbPlaceholder && (
              <img
                src={dbPlaceholder}
                alt={product.title ? `${product.title} placeholder` : 'placeholder'}
                aria-hidden
                className={`absolute top-0 left-0 w-full h-full object-cover filter blur-sm scale-105 transition-opacity duration-500 ${imgLoaded ? 'opacity-0' : 'opacity-100'}`}
              />
            )}

            <img
              src={finalFallback}
              srcSet={finalSrcSet}
              sizes="(max-width: 640px) 50vw, 25vw"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              alt={product.title || 'Product image'}
              width={dbWidth}
              height={dbHeight}
              className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => {
                setProductImage(null);
                setImgLoaded(true);
              }}
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
            <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
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
                    +{variants.length - 3} more
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