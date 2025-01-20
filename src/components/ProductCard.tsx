import { useEffect, useState } from 'react';
import { ArrowBigUp, ExternalLink, MessageCircle } from 'lucide-react';
import { Product } from '../types'; // Updated type import
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ProductCardProps {
  product: Product; //  type
  onVote: (productId: number) => void; // Adjusted type for onVote
}

export function ProductCard({ product, onVote }: ProductCardProps) {
  const [commentCount, setCommentCount] = useState(0);
  const [variantPrice, setVariantPrice] = useState<number | null>(null);
  const [productImage, setProductImage] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchVariantAndImage = async () => {
      // Fetch price from the variants table
      const { data: variantData, error: variantError } = await supabase
        .from('variants')
        .select('price')
        .eq('product_id', product.id)
        .single(); // Assuming one variant for simplicity; adjust if needed

      if (!variantError && variantData) {
        setVariantPrice(variantData.price);
      }

      // Fetch image URL from the images table
      const { data: imageData, error: imageError } = await supabase
        .from('images')
        .select('src')
        .eq('product_id', product.id)
        .limit(1) // Limit to 1 image
        .single();

      if (!imageError && imageData) {
        setProductImage(imageData.src);
      }
    };

    fetchVariantAndImage();
  }, [product.id]);

  useEffect(() => {
    const fetchCommentCount = async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*', { count: 'exact' })
        .eq('product_id', product.id); // Changed to use `product_id`

      if (!error) {
        setCommentCount(data.length);
      }
    };

    fetchCommentCount();
  }, [product.id]);

  const handleCardClick = () => {
    navigate(`/products/${product.id}`); // Changed route to `/products/${product.id}`
  };

  return (
    <div
      className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="flex gap-4 flex-wrap">
        <div className="flex-shrink-0">
          <img
            src={productImage || '/default-image.png'} // Fallback to a default image if none found
            alt={product.title || 'Product image'}
            className="w-24 h-24 object-cover rounded-lg"
          />
        </div>

        <div className="flex-grow">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">{product.title}</h2>
            <a
              href={product.url || '#'} // Added fallback to '#' if product.url is null
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
              onClick={(e) => e.stopPropagation()} // Prevent card redirection.
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>

          {/* Display the product vendor */}
          <p className="text-sm text-gray-500 mt-1">{product.vendor}</p>

          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {variantPrice !== null && (
                <span className="text-2xl font-bold text-green-600">${variantPrice.toFixed(2)}</span>
              )}
            </div>
            <div className="flex gap-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onVote(product.id); // Convert product.id to string
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-400 hover:bg-gray-200 transition-colors"
              >
                <ArrowBigUp className="w-4 h-4" />
                <span>{product.votes}</span> {/* Assuming votes field exists in the product table */}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/products/${product.id}#comments`); // Adjusted route to products
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-400 hover:bg-gray-200 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{commentCount}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 text-sm text-gray-500">
        Posted {formatDistanceToNow(new Date(product.created_at || ''))} ago {/* Added fallback empty string */}
      </div>
    </div>
  );
}
