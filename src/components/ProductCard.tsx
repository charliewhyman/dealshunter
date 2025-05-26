import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Product } from '../types';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useProductPricing } from '../hooks/useProductPricing';
import '../index.css';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const [productImage, setProductImage] = useState<string | null>(null);
  const [variants, setVariants] = useState<Array<{ title: string; available: boolean }>>([]);
  const [allVariantsUnavailable, setAllVariantsUnavailable] = useState(false);
  const [showAllVariants, setShowAllVariants] = useState(false);
  const navigate = useNavigate();
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(product.id);

  // Determine product availability based on both product.in_stock and variants
  const isAvailable = product.in_stock && !allVariantsUnavailable;

  useEffect(() => {
    const fetchVariantAndImage = async () => {
      // Fetch image
      const { data: imageData, error: imageError } = await supabase
        .from('images')
        .select('src')
        .eq('product_id', product.id)
        .limit(1)
        .maybeSingle();

      if (!imageError && imageData) {
        setProductImage(imageData.src);
      }

      // Fetch variants
      const { data: variantsData, error: variantsError } = await supabase
        .from('variants')
        .select('title, inventory_quantity, available')
        .eq('product_id', product.id);

      if (!variantsError && variantsData) {
        const filteredVariants = variantsData
          .filter(variant => variant.title !== 'Default Title')
          .map(variant => ({
            title: variant.title,
            available: variant.available,
          }));
        
        setVariants(filteredVariants);
        setAllVariantsUnavailable(filteredVariants.length > 0 && filteredVariants.every(variant => !variant.available));
      }
    };

    fetchVariantAndImage();
  }, [product.id]);

  const handleCardClick = () => {
    navigate(`/products/${product.id}`);
  };

  const discountPercentage = compareAtPrice && variantPrice 
    ? Math.round(((compareAtPrice - (offerPrice ?? variantPrice)) / compareAtPrice) * 100)
    : 0;

  // Limit displayed variants to 3 unless showAllVariants is true
  const displayedVariants = showAllVariants ? variants : variants.slice(0, 3);
  const hasHiddenVariants = variants.length > 3 && !showAllVariants;

  return (
    <div
      className={`relative flex flex-col h-full bg-white dark:bg-gray-800 rounded-md shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden ${
        !isAvailable ? 'opacity-80' : ''
      }`}
      onClick={handleCardClick}
      style={{ margin: '0 10px' }}
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
          {product.in_stock === false ? 'OUT OF STOCK' : 'UNAVAILABLE'}
        </div>
      )}

      {/* Image Container */}
      <div className="relative w-full pt-[70%] overflow-hidden">
        {productImage ? (
          <img
            src={productImage}
            loading="lazy"
            alt={product.title || 'Product image'}
            className="absolute top-0 left-0 w-full h-full object-cover"
            onError={() => setProductImage(null)}
          />
        ) : (
          <div className="absolute top-0 left-0 w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
            <span className="text-gray-400">No Image</span>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-3 flex flex-col flex-grow">
        {/* Shop Name */}
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
          {product.shop_name}
        </p>

        {/* Title and External Link */}
        <div className="flex items-start justify-between mb-2">
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
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Price Information */}
        <div className="mt-auto">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              ${offerPrice?.toFixed(2) ?? variantPrice?.toFixed(2) ?? '0.00'}
            </span>
            {compareAtPrice && compareAtPrice > ((offerPrice ?? variantPrice) ?? 0) && (
              <span className="text-xs text-gray-500 dark:text-gray-400 line-through">
                ${compareAtPrice.toFixed(2)}
              </span>
            )}
          </div>

          {/* Variants */}
          {variants.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-1">
                {displayedVariants.map((variant, index) => (
                  <span
                    key={index}
                    className={`text-xs px-2 py-1 rounded-full border ${
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
                    className="text-xs px-2 py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
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
                    className="text-xs px-2 py-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
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