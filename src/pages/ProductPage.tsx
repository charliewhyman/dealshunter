import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Product, CommentWithUser } from '../types';
import { ExternalLink } from 'lucide-react';
import CommentsList from '../components/CommentsList';
import { useProductPricing } from '../hooks/useProductPricing';

function ProductPage() {

  const { ProductId } = useParams<{ ProductId: string }>();
  const [Product, setProduct] = useState<Product | null>(null);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [productImage, setProductImage] = useState<string | undefined>(undefined);
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(ProductId!);

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        const { data: ProductData, error: ProductError } = await supabase
          .from('products')
          .select('*')
          .eq('id', ProductId)
          .single();

        if (ProductError) throw ProductError;
        setProduct(ProductData);

        // Fetch image URL
        const { data: imageData, error: imageError } = await supabase
          .from('images')
          .select('src')
          .eq('product_id', ProductId)
          .limit(1)
          .single();

        if (!imageError && imageData) {
          setProductImage(imageData.src);
        }

        // Query to get comment data and parent comment's text for replies
        const { data: commentsData, error: commentsError } = await supabase
          .from('comments')
          .select(`
            *,
            Products (
              id
            ),
            profiles (
              username
            ),
            parent_comment: reply_of (
              comment_text,
              profiles (
                username
              )
            )
          `)
          .eq('Products.id', ProductId);

        if (commentsError) throw commentsError;

        setComments(commentsData as CommentWithUser[]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    if (ProductId) fetchProductData();
  }, [ProductId]);

  if (loading) return <p className="text-gray-900">Loading...</p>;
  if (!Product) return <p className="text-gray-900">Product not found.</p>;

  return (
    <div className="p-6">
      <div className="text-gray-900">
        <div className="flex gap-6 items-center">
          {/* Photo Section */}
          <img
            src={productImage ?? '/default-image.png'}
            alt={Product?.title ?? 'Product image'}
            className="w-1/3 object-cover rounded-md"
          />

          {/* Product Details */}
          <div className="flex-1 flex flex-col gap-4">
            <h1 className="text-2xl font-bold">{Product.title}</h1>
            {variantPrice !== null && (
              <>
                {offerPrice !== null && offerPrice <= variantPrice ? (
                  <span className="text-2xl font-bold text-green-600">
                    ${offerPrice.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-green-600">
                    ${variantPrice.toFixed(2)}
                  </span>
                )}
              </>
            )}
            {compareAtPrice && (
              <p className="text-sm text-gray-500 line-through">
                ${compareAtPrice.toFixed(2)}
              </p>
            )}
            <p className="text-lg">{Product.description}</p>
            <a
              href={Product.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex items-center justify-center gap-2 px-3 py-1 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 w-1/3"
            >
              <span className="flex-1 text-center">Get Product</span>
              <ExternalLink className="w-5 h-5 text-white" />
            </a>
          </div>
        </div>

        {/* Comments Section */}
        <div className="container mx-auto mt-8">
          <h1 className="text-2xl font-bold mb-4">Comments</h1>
          <CommentsList comments={comments} />
          </div>
      </div>
    </div>
  );
}

export default ProductPage;
