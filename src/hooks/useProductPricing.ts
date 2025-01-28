import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ProductPricing {
  variantPrice: number | null;
  compareAtPrice: number | null;
  offerPrice: number | null;
}

export function useProductPricing(productId: number | string): ProductPricing {
  const [variantPrice, setVariantPrice] = useState<number | null>(null);
  const [compareAtPrice, setCompareAtPrice] = useState<number | null>(null);
  const [offerPrice, setOfferPrice] = useState<number | null>(null);

  useEffect(() => {
    const fetchPricing = async () => {
      // Fetch prices from all variants
      const { data: variantData, error: variantError } = await supabase
        .from('variants')
        .select('price, compare_at_price')
        .eq('product_id', productId.toString());

      if (!variantError && variantData && variantData.length > 0) {
        const lowestPriceVariant = variantData.reduce((min, curr) => 
          parseFloat(curr.price) < parseFloat(min.price) ? curr : min
        );
        setVariantPrice(parseFloat(lowestPriceVariant.price));
        if (lowestPriceVariant.compare_at_price) {
          setCompareAtPrice(parseFloat(lowestPriceVariant.compare_at_price));
        }
      }

      // Fetch current valid offer
      const today = new Date().toISOString().split('T')[0];
      const { data: offerData, error: offerError } = await supabase
        .from('offers')
        .select('price')
        .eq('product_id', productId.toString())
        .gte('price_valid_until', today)
        .order('price', { ascending: true })
        .limit(1);

      if (!offerError && offerData && offerData.length > 0) {
        setOfferPrice(parseFloat(offerData[0].price));
      }
    };

    fetchPricing();
  }, [productId]);

  return { variantPrice, compareAtPrice, offerPrice };
} 