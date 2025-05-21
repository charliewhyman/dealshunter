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
  const navigate = useNavigate();
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(product.id);

  useEffect(() => {
    const fetchVariantAndImage = async () => {
      const { data: imageData, error: imageError } = await supabase
        .from('images')
        .select('src')
        .eq('product_id', product.id)
        .limit(1)
        .maybeSingle();

      if (!imageError && imageData) {
        setProductImage(imageData.src);
      }
    };

    fetchVariantAndImage();
  }, [product.id]);

  useEffect(() => {
    const fetchVariants = async () => {
      const { data: variantsData, error: variantsError } = await supabase
        .from('variants')
        .select('title, inventory_quantity, available')
        .eq('product_id', product.id);

      if (!variantsError && variantsData) {
        setVariants(
          variantsData.map((variant) => ({
            title: variant.title,
            available: variant.available,
          }))
        );
        setAllVariantsUnavailable(variantsData.every((variant) => !variant.available));
      }
    };

    fetchVariants();
  }, [product.id]);

  const handleCardClick = () => {
    navigate(`/products/${product.id}`);
  };

  const discountPercentage = compareAtPrice && variantPrice 
    ? Math.round(((compareAtPrice - (offerPrice ?? variantPrice)) / compareAtPrice) * 100)
    : 0;

  return (
    <div
      className={`relative flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden ${
        allVariantsUnavailable ? 'opacity-80' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Discount Badge */}
      {compareAtPrice && compareAtPrice > ((offerPrice ?? variantPrice) ?? 0) && (
        <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded z-10">
          {discountPercentage}% OFF
        </div>
      )}

      {/* Availability Badge */}
      {allVariantsUnavailable && (
        <div className="absolute top-3 right-3 bg-gray-800 text-white text-xs font-bold px-2 py-1 rounded z-10">
          UNAVAILABLE
        </div>
      )}

      {/* Image Container */}
      <div className="relative w-full pt-[100%] overflow-hidden">
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
      <div className="p-4 flex flex-col flex-grow">
        {/* Shop Name */}
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
          {product.shop_name}
        </p>

        {/* Title and External Link */}
        <div className="flex items-start justify-between mb-2">
          <h3
            className={`text-md font-medium text-gray-900 dark:text-gray-100 text-left line-clamp-2 ${
              allVariantsUnavailable ? 'line-through' : ''
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
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              ${offerPrice?.toFixed(2) ?? variantPrice?.toFixed(2) ?? '0.00'}
            </span>
            {compareAtPrice && compareAtPrice > ((offerPrice ?? variantPrice) ?? 0) && (
              <span className="text-sm text-gray-500 dark:text-gray-400 line-through">
                ${compareAtPrice.toFixed(2)}
              </span>
            )}
          </div>

          {/* Variants */}
          {variants.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {variants.map(
                (variant, index) =>
                  variant.title !== 'Default Title' && (
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
                  )
              )}
            </div>
          )}
        </div>

        {/* Timestamp 
        <p className="text-xs text-gray-400 mt-2">
          Added {formatDistanceToNow(new Date(product.created_at || ''))} ago
        </p>
        */}
      </div>
    </div>
  );
}