import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Product } from '../types';
import { formatDistanceToNow } from 'date-fns';
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

  return (
    <div
      className={`flex flex-col items-center text-center justify-between h-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer ${
        allVariantsUnavailable ? 'opacity-50' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Image */}
      {productImage && (
        <img
          src={productImage}
          loading="lazy"
          alt={product.title || 'Product image'}
          className="w-full h-48 object-cover rounded mb-4"
          onError={() => setProductImage(null)}
        />
      )}

      {/* Title and Link */}
      <div className="w-full flex items-start justify-between mb-1">
        <h2
          className={`text-base font-semibold text-gray-900 dark:text-gray-100 text-left line-clamp-2 ${
            allVariantsUnavailable ? 'line-through' : ''
          }`}
        >
          {product.title}
        </h2>
        <a
          href={product.url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 ml-2"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-5 h-5 shrink-0" />
        </a>
      </div>

      {/* Shop Name */}
      <p className="text-sm text-gray-500 dark:text-gray-400 w-full text-left mb-2">
        {product.shop_name}
      </p>

      {/* Price */}
      <div className="flex items-center gap-3 text-3xl font-semibold">
        <span className="text-green-600 dark:text-green-500">
          ${offerPrice?.toFixed(2) ?? variantPrice?.toFixed(2) ?? '0.00'}
        </span>
        {compareAtPrice && compareAtPrice > ((offerPrice ?? variantPrice) ?? 0) && (
          <span className="text-lg text-gray-500 dark:text-gray-400 line-through">
            ${compareAtPrice.toFixed(2)}
          </span>
        )}
</div>


      {/* Variants */}
      {variants.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 mb-3">
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

      {/* Timestamp */}
      <p className="text-xs text-gray-400 mt-auto">
        Posted {formatDistanceToNow(new Date(product.created_at || ''))} ago
      </p>
    </div>
  );
}
