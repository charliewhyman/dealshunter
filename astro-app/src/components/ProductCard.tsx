import type { Product } from '@/lib/types';

export function ProductCard({ product }: { product: Product }) {
  const img = product.images?.[0];
  const price = product.min_price !== null ? Number(product.min_price) : null;
  const discount = product.max_discount_percentage !== null
    ? Math.round(Number(product.max_discount_percentage))
    : 0;

  return (
    <a href={`/products/${product.handle}`} className="group block">
      <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
        {img && (
          <img
            src={img.src}
            alt={img.alt ?? product.title ?? ''}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        )}
      </div>
      <div className="mt-2">
        {product.shop_name && (
          <p className="text-sm text-gray-500">{product.shop_name}</p>
        )}
        <h3 className="text-sm font-medium line-clamp-2">{product.title}</h3>
        {price !== null && (
          <p className="mt-1 text-sm font-semibold">
            ${price.toFixed(2)}
            {discount > 0 && (
              <span className="ml-2 text-xs font-normal text-red-600">
                -{discount}%
              </span>
            )}
          </p>
        )}
      </div>
    </a>
  );
}