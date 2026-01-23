import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { ProductWithDetails } from '../types';
import AsyncLucideIcon from '../components/AsyncLucideIcon';
import { useProductPricing } from '../hooks/useProductPricing';
import '../index.css';
import { format } from 'date-fns/format';
import { Header } from '../components/Header';

function ProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<ProductWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(productId || '');
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true);
        const supabase = await getSupabase();
        
        // Fetch product with all details
        const { data: productData, error: productError } = await supabase
          .from('products_with_details_core')
          .select('*')
          .eq('id', productId)
          .single();
  
        if (productError) throw productError;
        if (!productData) {
          setProduct(null);
          return;
        }
        
        console.log('Product data fetched:', productData); // Debug log
        
        setProduct(productData as ProductWithDetails);
      } catch (error) {
        console.error('Error fetching data:', error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
  
    if (productId) fetchProductData();
  }, [productId]);

  // Parse images from product data
  const imagesArray = useMemo(() => {
    if (!product) return [];
    
    if (Array.isArray(product.images)) {
      return product.images;
    }
    if (typeof product.images === 'string') {
      try {
        const parsed = JSON.parse(product.images);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [product]);

  // Get the first image data
  const firstImageRecord = imagesArray[0] as Record<string, unknown> | undefined;
  const imageSrc = firstImageRecord?.src as string | undefined;
  const dbWidth = firstImageRecord?.width as number | undefined;
  const dbHeight = firstImageRecord?.height as number | undefined;
  const dbAlt = firstImageRecord?.alt as string | undefined;

  // Parse variants from product data
  const variants = useMemo(() => {
    if (!product) return [];
    
    let variantsArray: unknown[] = [];
    
    if (Array.isArray(product.variants)) {
      variantsArray = product.variants;
    } else if (typeof product.variants === 'string') {
      try {
        const parsed = JSON.parse(product.variants);
        variantsArray = Array.isArray(parsed) ? parsed : [];
      } catch {
        variantsArray = [];
      }
    }
    
    return variantsArray
      .filter((variant: unknown): variant is { title: string; available?: unknown } =>
        typeof variant === 'object' &&
        variant !== null &&
        'title' in variant &&
        typeof (variant as Record<string, unknown>).title === 'string'
      )
      .map((variant) => ({
        title: variant.title,
        available: Boolean(variant.available),
      }));
  }, [product]);

  // Build image URL and srcsets
  const { finalSrc, finalSrcSet, finalWebpSrcSet } = useMemo(() => {
    if (!imageSrc || !imageSrc.startsWith('http')) {
      return { finalSrc: undefined, finalSrcSet: undefined, finalWebpSrcSet: undefined };
    }

    const buildSrcSets = (url: string) => {
      try {
        const sizes = [640, 960, 1280];
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
        fallbackParams.set('width', '960');
        const src = `${base}?${fallbackParams.toString()}`;

        return { src, srcSet, webpSrcSet };
      } catch {
        return { src: url, srcSet: undefined, webpSrcSet: undefined };
      }
    };

    const { src, srcSet, webpSrcSet } = buildSrcSets(imageSrc);
    return { finalSrc: src, finalSrcSet: srcSet, finalWebpSrcSet: webpSrcSet };
  }, [imageSrc]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/?search=${searchQuery}`);
  };

  // Calculate discount percentage
  const discountPercentage = useMemo(() => {
    if (typeof compareAtPrice === 'number' && compareAtPrice > 0) {
      const price = (offerPrice ?? variantPrice) ?? 0;
      if (price > 0) {
        return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
      }
    }
    return 0;
  }, [compareAtPrice, variantPrice, offerPrice]);

  // Check product availability
  const isAvailable = useMemo(() => {
    if (!product) return false;
    const allVariantsUnavailable = variants.length > 0 && variants.every(v => !v.available);
    return product.in_stock && !allVariantsUnavailable;
  }, [product, variants]);

  // Check if content is HTML (looks for HTML tags)
  const isHtmlDescription = useMemo(() => {
    if (!product?.description) return false;
    
    const description = product.description;
    // Check if it contains HTML tags
    const htmlRegex = /<[a-z][\s\S]*>/i;
    return htmlRegex.test(description);
  }, [product?.description]);

  // Extract plain text from HTML for preview
  const descriptionPreview = useMemo(() => {
    if (!product?.description) return '';
    
    const description = product.description;
    
    if (isHtmlDescription) {
      // Create temp element to extract text
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = description;
      const text = tempDiv.textContent || tempDiv.innerText || '';
      
      if (text.length > 300 && !showFullDescription) {
        return text.slice(0, 300) + '...';
      }
      return text;
    }
    
    // Plain text
    if (description.length > 300 && !showFullDescription) {
      return description.slice(0, 300) + '...';
    }
    return description;
  }, [product?.description, isHtmlDescription, showFullDescription]);

  // Check if description needs truncation
  const needsTruncation = useMemo(() => {
    if (!product?.description) return false;
    
    if (isHtmlDescription) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = product.description;
      const text = tempDiv.textContent || tempDiv.innerText || '';
      return text.length > 300;
    }
    
    return product.description.length > 300;
  }, [product?.description, isHtmlDescription]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  if (!product) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 text-center">
      <p className="text-gray-900 dark:text-gray-100 text-xl">Product not found.</p>
      <p className="text-gray-600 dark:text-gray-400 mt-2">
        The product with ID {productId} could not be loaded.
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Header
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-8">
        <div className="text-gray-900 dark:text-gray-100">
          <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
            {/* Photo Section */}
            <div className="w-full lg:w-1/2 xl:w-2/5">
              <div className="sticky top-4">
                <div className="w-full h-auto max-h-[70vh] relative">
                  {finalSrc ? (
                    <picture>
                      {finalWebpSrcSet && (
                        <source type="image/webp" srcSet={finalWebpSrcSet} sizes="(max-width: 768px) 100vw, 50vw" />
                      )}
                      {finalSrcSet && (
                        <source srcSet={finalSrcSet} sizes="(max-width: 768px) 100vw, 50vw" />
                      )}
                      <img
                        src={finalSrc}
                        srcSet={finalSrcSet}
                        sizes="(max-width: 768px) 100vw, 50vw"
                        loading="eager"
                        decoding="async"
                        width={dbWidth}
                        height={dbHeight}
                        alt={dbAlt || product?.title || 'Product image'}
                        className={`relative w-full h-auto max-h-[70vh] object-contain rounded-lg shadow-md transition-opacity duration-500 ${
                          imgLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                        onLoad={() => setImgLoaded(true)}
                        onError={() => setImgLoaded(true)}
                      />
                    </picture>
                  ) : (
                    <div className="w-full h-[400px] bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                      <span className="text-gray-400">No Image Available</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="w-full lg:w-1/2 xl:w-3/5 space-y-4 sm:space-y-6">
              {/* Shop Name */}
              {product.shop_name && (
                <p className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {product.shop_name}
                </p>
              )}

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
                {product.title}
              </h1>
              
              {/* Availability Badge */}
              {!isAvailable && (
                <div className="inline-block px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm font-medium rounded-md">
                  {!product.in_stock ? 'Out of Stock' : 'Currently Unavailable'}
                </div>
              )}
              
              {/* Price Section */}
              <div className="space-y-2">
                {variantPrice !== null && (
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">
                      ${(offerPrice ?? variantPrice).toFixed(2)}
                    </span>
                    
                    {compareAtPrice && compareAtPrice > (offerPrice ?? variantPrice) && (
                      <>
                        <span className="text-xl sm:text-2xl text-gray-500 dark:text-gray-400 line-through">
                          ${compareAtPrice.toFixed(2)}
                        </span>
                        <span className="px-2.5 py-1 bg-red-600 text-white text-sm font-bold rounded">
                          Save {discountPercentage}%
                        </span>
                      </>
                    )}
                  </div>
                )}
                
                {product.min_price != null && variantPrice === null && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Starting from ${product.min_price.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Variants Section */}
              {variants.length > 0 && variants.some(v => v.title !== 'Default Title') && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                    Available Options
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {variants.map(
                      (variant, index) =>
                        variant.title !== 'Default Title' && (
                          <span
                            key={index}
                            className={`text-sm px-4 py-2 rounded-md border transition-colors ${
                              variant.available
                                ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-gray-400 dark:hover:border-gray-500'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 cursor-not-allowed line-through'
                            }`}
                          >
                            {variant.title}
                            {!variant.available && <span className="ml-1 text-xs">(Unavailable)</span>}
                          </span>
                        )
                    )}
                  </div>
                </div>
              )}
              
              {/* Purchase Button */}
              <div className="pt-2">
                <a
                  href={product.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center gap-2 w-full px-6 py-4 text-base sm:text-lg font-semibold rounded-lg transition-all duration-200 ${
                    isAvailable
                      ? 'text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 shadow-md hover:shadow-lg'
                      : 'text-gray-500 bg-gray-200 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'
                  }`}
                  {...(!isAvailable && { onClick: (e: React.MouseEvent) => e.preventDefault() })}
                >
                  <span>{isAvailable ? 'View on Store' : 'Currently Unavailable'}</span>
                  {isAvailable && <AsyncLucideIcon name="ExternalLink" className="w-5 h-5" />}
                </a>
              </div>

              {/* Description Section - SIMPLIFIED */}
              {product.description ? (
                <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Product Description
                  </h2>
                  
                  {isHtmlDescription ? (
                    // HTML Description
                    <div className="space-y-4">
                      <div 
                        className="text-gray-700 dark:text-gray-300 description-html"
                        dangerouslySetInnerHTML={{ 
                          __html: showFullDescription 
                            ? product.description 
                            : descriptionPreview 
                        }}
                      />
                      
                      {needsTruncation && (
                        <button
                          onClick={() => setShowFullDescription(!showFullDescription)}
                          className="text-sm font-medium text-blue-600 dark:text-blue-400 
                            hover:text-blue-700 dark:hover:text-blue-300 
                            inline-flex items-center gap-1 focus:outline-none"
                        >
                          {showFullDescription ? (
                            <>
                              Show less
                              <AsyncLucideIcon name="ChevronUp" className="w-4 h-4" />
                            </>
                          ) : (
                            <>
                              Read more
                              <AsyncLucideIcon name="ChevronDown" className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    // Plain Text Description
                    <div className="space-y-4">
                      <div className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                        {showFullDescription || !needsTruncation 
                          ? product.description 
                          : descriptionPreview}
                      </div>
                      
                      {needsTruncation && (
                        <button
                          onClick={() => setShowFullDescription(!showFullDescription)}
                          className="text-sm font-medium text-blue-600 dark:text-blue-400 
                            hover:text-blue-700 dark:hover:text-blue-300 
                            inline-flex items-center gap-1 focus:outline-none"
                        >
                          {showFullDescription ? (
                            <>
                              Show less
                              <AsyncLucideIcon name="ChevronUp" className="w-4 h-4" />
                            </>
                          ) : (
                            <>
                              Read more
                              <AsyncLucideIcon name="ChevronDown" className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    Product Description
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 italic">
                    No description available.
                  </p>
                </div>
              )}

              {/* Product Meta Information */}
              <div className="pt-6 border-t border-gray-200 dark:border-gray-700 space-y-3">
                {product.grouped_product_type && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300 min-w-24">Category:</span>
                    <span className="text-gray-600 dark:text-gray-400">{product.grouped_product_type}</span>
                  </div>
                )}
                
                {product.shop_name && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300 min-w-24">Brand:</span>
                    <span className="text-gray-600 dark:text-gray-400">{product.vendor}</span>
                  </div>
                )}
                
                {product.shop_name && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300 min-w-24">Store:</span>
                    <span className="text-gray-600 dark:text-gray-400">{product.shop_name}</span>
                  </div>
                )}
                
                {product.tags && Array.isArray(product.tags) && product.tags.length > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300 min-w-24">Tags:</span>
                    <div className="flex flex-wrap gap-1">
                      {product.tags.slice(0, 10).map((tag, index) => (
                        <span 
                          key={index} 
                          className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                      {product.tags.length > 10 && (
                        <span className="text-gray-500 dark:text-gray-500 text-xs">
                          +{product.tags.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="flex items-start gap-2 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300 min-w-24">Last updated:</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {product.updated_at_external
                      ? format(new Date(product.updated_at_external), 'MMMM do, yyyy')
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ProductPage;