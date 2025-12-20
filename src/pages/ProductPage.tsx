import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSupabase } from '../lib/supabase';
import { Product } from '../types';
import AsyncLucideIcon from '../components/AsyncLucideIcon';
import { useProductPricing } from '../hooks/useProductPricing';
import '../index.css';
import { format } from 'date-fns/format';
import { Header } from '../components/Header';

function ProductPage() {
  const { ProductId } = useParams<{ ProductId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [productImage, setProductImage] = useState<string | undefined>(undefined);
  type ImageRecord = {
    src?: string;
    responsive_fallback?: string;
    srcset?: string;
    webp_srcset?: string;
    placeholder?: string;
    width?: number;
    height?: number;
  };
  const [imageRecord, setImageRecord] = useState<ImageRecord | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [variants, setVariants] = useState<Array<{ title: string; available: boolean }>>([]);
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(ProductId!);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true);
        const supabase = await getSupabase();
        
        // Fetch product
        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', ProductId)
          .single();
  
        if (productError) throw productError;
        if (!productData) {
          setProduct(null);
          return;
        }
        
        setProduct(productData);
  
        // Fetch image (include responsive fields if available)
        const { data: imageData } = await supabase
          .from('images')
          .select('src, responsive_fallback, srcset, webp_srcset, placeholder, width, height')
          .eq('product_id', ProductId)
          .limit(1)
          .single();

        setImageRecord(imageData || null);
        setProductImage((imageData && ((imageData.responsive_fallback as string) || (imageData.src as string))) ?? undefined);
  
        // Fetch variants
        const { data: variantsData } = await supabase
          .from('variants')
          .select('title, available')
          .eq('product_id', ProductId);
  
        setVariants(variantsData || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
  
    if (ProductId) fetchProductData();
  }, [ProductId]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    navigate(`/?search=${searchQuery}`);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-900 dark:text-gray-100">Loading...</p>
    </div>
  );

  if (!product) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 text-center">
      <p className="text-gray-900 dark:text-gray-100 text-xl">Product not found.</p>
      <p className="text-gray-600 dark:text-gray-400 mt-2">
        The product with ID {ProductId} could not be loaded.
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="text-gray-900 dark:text-gray-100">
          <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
            {/* Photo Section - Responsive sizing */}
            <div className="w-full lg:w-1/2 xl:w-2/5">
              <div className="sticky top-4">
                <div className="w-full h-auto max-h-[70vh] relative">
                  {/* placeholder */}
                  {imageRecord?.placeholder && (
                    <img
                      src={imageRecord.placeholder as string}
                      alt={product?.title ? `${product.title} placeholder` : 'placeholder'}
                      aria-hidden
                      className={`absolute inset-0 w-full h-full object-contain filter blur-sm scale-105 transition-opacity duration-500 ${imgLoaded ? 'opacity-0' : 'opacity-100'}`}
                    />
                  )}

                  <picture>
                    {imageRecord?.webp_srcset && (
                      <source type="image/webp" srcSet={imageRecord.webp_srcset as string} />
                    )}
                    <img
                      src={productImage ?? '/default-image.png'}
                      srcSet={imageRecord?.srcset as string | undefined}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      decoding="async"
                      fetchPriority="high"
                      alt={product?.title ?? 'Product image'}
                      className={`relative w-full h-auto max-h-[70vh] object-contain rounded-lg shadow-md transition-opacity duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                      onLoad={() => setImgLoaded(true)}
                    />
                  </picture>
                </div>
              </div>
            </div>

            {/* Product Details - Responsive spacing */}
            <div className="w-full lg:w-1/2 xl:w-3/5 space-y-4 sm:space-y-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {product.title}
              </h1>
              
              {/* Price Section */}
              <div className="space-y-1 sm:space-y-2">
                {variantPrice !== null && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    {offerPrice !== null && offerPrice <= variantPrice ? (
                      <span className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-500">
                        ${offerPrice.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-500">
                        ${variantPrice.toFixed(2)}
                      </span>
                    )}
                    {compareAtPrice && (
                      <span className="text-base sm:text-lg text-gray-500 dark:text-gray-400 line-through">
                        ${compareAtPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <p className="text-base sm:text-lg leading-relaxed text-gray-700 dark:text-gray-300">
                {product.description}
              </p>

              {/* Purchase Button - Responsive sizing */}
              <div className="pt-2 sm:pt-4">
                <a
                  href={product.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 text-sm sm:text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors duration-200"
                >
                  <span>Get Product</span>
                  <AsyncLucideIcon name="ExternalLink" className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </a>
              </div>

              {/* Variants Section */}
              {variants.some(v => v.title !== 'Default Title') && (
                <div className="pt-3 sm:pt-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Variants</h3>
                  <div className="flex flex-wrap gap-1 sm:gap-2">
                    {variants.map(
                      (variant, index) =>
                        variant.title !== 'Default Title' && (
                          <span
                            key={index}
                            className={`text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5 rounded-full border ${
                              variant.available
                                ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                                : 'border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {variant.title}
                          </span>
                        )
                    )}
                  </div>
                </div>
              )}

              {/* Last updated section */}
              <div className="pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Last updated: {product.updated_at_external
                    ? format(new Date(product.updated_at_external), 'MMMM do, yyyy h:mm a')
                    : 'No update date available'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default ProductPage;