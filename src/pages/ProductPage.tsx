import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { ExternalLink } from 'lucide-react';
import { useProductPricing } from '../hooks/useProductPricing';
import '../index.css';
import { format } from 'date-fns/format';

function ProductPage() {
  const { ProductId } = useParams<{ ProductId: string }>();
  const [Product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [productImage, setProductImage] = useState<string | undefined>(undefined);
  const [variants, setVariants] = useState<Array<{ title: string, available: boolean }>>([]);
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
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchProductData();
}, [ProductId]);

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

        // Fetch variants
        const { data: variantsData, error: variantsError } = await supabase
          .from('variants')
          .select('title,inventory_quantity,available')
          .eq('product_id', ProductId);

        if (!variantsError && variantsData) {
          setVariants(variantsData.map(variant => ({
            title: variant.title,
            available: variant.available
          })));
        }

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
            {/* Variants Section */}
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
            {/* Last updated section */}
            <div>
              <p className="text-sm text-gray-500">{Product.updated_at_external 
                ? format(new Date(Product.updated_at_external), "MMMM do, yyyy H:mma") 
                : 'No update date available'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductPage;