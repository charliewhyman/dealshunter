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
  const [variants, setVariants] = useState<Array<{title: string, available: boolean}>>([]);
  const [allVariantsUnavailable, setAllVariantsUnavailable] = useState(false);
  const navigate = useNavigate();
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(product.id);

  useEffect(() => {
    const fetchVariantAndImage = async () => {
      // Fetch image URL from the images table
      const { data: imageData, error: imageError } = await supabase
        .from('images')
        .select('src')
        .eq('product_id', product.id)
        .limit(1)
        .single();

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
        .select('title,inventory_quantity,available')
        .eq('product_id', product.id);

      if (!variantsError && variantsData) {
        setVariants(variantsData.map(variant => ({
          title: variant.title,
          available: variant.available
        })));
        setAllVariantsUnavailable(variantsData.every(variant => !variant.available));
      }
    };

    fetchVariants();
  }, [product.id]);

  const handleCardClick = () => {
    navigate(`/products/${product.id}`);
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer ${allVariantsUnavailable ? 'opacity-50' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex gap-4 flex-wrap">
        <div className="flex-shrink-0">
          <img
            src={productImage || '/default-image.png'} // Fallback to a default image if none found - TODO add default image
            alt={product.title || 'Product image'}
            className="w-24 h-24 object-cover rounded-lg"
          />
        </div>

        <div className="flex-grow">
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-semibold text-gray-900 ${allVariantsUnavailable ? 'line-through' : ''}`}>{product.title}</h2>
            <a
              href={product.url || '#'} //Fallback to '#' if product.url is null
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
              onClick={(e) => e.stopPropagation()} // Prevent card redirection.
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>

          {/* Display the product shop_name */}
          <p className="text-sm text-gray-500 mt-1">{product.shop_name}</p>

          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {variantPrice !== null && (
                <>
                  {offerPrice !== null && offerPrice <= variantPrice ? (
                    <>
                      <span className="text-2xl font-bold text-green-600">${offerPrice.toFixed(2)}</span>
                      {compareAtPrice && compareAtPrice > offerPrice && (
                        <span className="text-sm text-gray-500 line-through">${compareAtPrice.toFixed(2)}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-green-600">${variantPrice.toFixed(2)}</span>
                      {compareAtPrice && compareAtPrice > variantPrice && (
                        <span className="text-sm text-gray-500 line-through">${compareAtPrice.toFixed(2)}</span>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {variants.map((variant, index) => 
                variant.title !== "Default Title" && (
                  <span
                    key={index}
                    className={`text-sm px-2 py-1 rounded-full border ${
                      variant.available 
                        ? 'border-gray-300 bg-gray-100 available' 
                        : 'border-gray-200 bg-gray-100 unavailable'
                    }`}
                  >
                    {variant.title}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 text-sm text-gray-500">
        Posted {formatDistanceToNow(new Date(product.created_at || ''))} ago
      </div>
    </div>
  );
}