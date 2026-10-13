import { ProductCard } from './ProductCard';
import type { Product } from '@/lib/types';

export function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) return <p>No products found.</p>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {products.map(p => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}