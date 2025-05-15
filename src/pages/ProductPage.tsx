import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Product } from '../types';
import { ExternalLink } from 'lucide-react';
import { useProductPricing } from '../hooks/useProductPricing';
import '../index.css';
import { format } from 'date-fns/format';
import { Header } from '../components/Header';

function ProductPage() {
  const { ProductId } = useParams<{ ProductId: string }>();
  const [Product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [productImage, setProductImage] = useState<string | undefined>(undefined);
  const [variants, setVariants] = useState<Array<{ title: string; available: boolean }>>([]);
  const { variantPrice, compareAtPrice, offerPrice } = useProductPricing(ProductId!);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        setLoading(true);
        
        // Fetch product
        const { data: ProductData, error: ProductError } = await supabase
          .from('products')
          .select('*')
          .eq('id', ProductId)
          .single();
  
        if (ProductError) throw ProductError;
        if (!ProductData) {
          setProduct(null);
          return;
        }
        
        setProduct(ProductData);
  
        // Fetch image
        const { data: imageData } = await supabase
          .from('images')
          .select('src')
          .eq('product_id', ProductId)
          .limit(1)
          .single();
  
        setProductImage(imageData?.src);
  
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

  if (loading) return <p className="text-gray-900 dark:text-gray-100">Loading...</p>;
  if (!Product) return (
    <div className="max-w-7xl mx-auto px-4 py-8 text-center">
      <p className="text-gray-900 dark:text-gray-100 text-xl">Product not found.</p>
      <p className="text-gray-600 dark:text-gray-400 mt-2">
        The product with ID {ProductId} could not be loaded.
      </p>
    </div>
  );

  return (
    <>
      <Header
        searchQuery={searchQuery}
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white dark:bg-gray-900">
        <div className="text-gray-900 dark:text-gray-100">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Photo Section */}
            <div className="md:w-1/2 lg:w-2/5">
              <img
                src={productImage ?? '/default-image.png'}
                loading='lazy'
                alt={Product?.title ?? 'Product image'}
                className="w-full h-auto max-h-[500px] object-contain rounded-lg shadow-md"
              />
            </div>

            {/* Product Details */}
            <div className="md:w-1/2 lg:w-3/5 space-y-6">
              <h1 className="text-3xl font-bold tracking-tight">{Product.title}</h1>
              
              <div className="space-y-2">
                {variantPrice !== null && (
                  <div className="flex items-center gap-3">
                    {offerPrice !== null && offerPrice <= variantPrice ? (
                      <span className="text-3xl font-bold text-green-600 dark:text-green-500">
                        ${offerPrice.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-3xl font-bold text-green-600 dark:text-green-500">
                        ${variantPrice.toFixed(2)}
                      </span>
                    )}
                    {compareAtPrice && (
                      <span className="text-lg text-gray-500 dark:text-gray-400 line-through">
                        ${compareAtPrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <p className="text-lg leading-relaxed text-gray-700 dark:text-gray-300">
                {Product.description}
              </p>

              <div className="pt-2">
                <a
                  href={Product.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors duration-200"
                >
                  <span>Get Product</span>
                  <ExternalLink className="w-5 h-5 text-white" />
                </a>
              </div>

              {/* Variants Section */}
              {variants.some(v => v.title !== 'Default Title') && (
                <div className="pt-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Variants</h3>
                  <div className="flex flex-wrap gap-2">
                    {variants.map(
                      (variant, index) =>
                        variant.title !== 'Default Title' && (
                          <span
                            key={index}
                            className={`text-sm px-3 py-1.5 rounded-full border ${
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
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Last updated: {Product.updated_at_external
                    ? format(new Date(Product.updated_at_external), 'MMMM do, yyyy h:mm a')
                    : 'No update date available'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ProductPage;