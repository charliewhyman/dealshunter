import { useParams, Navigate } from 'react-router-dom';
import { CATEGORIES } from '../data/categories';
import { HomePage } from './HomePage';
import type { ProductWithDetails } from '../types';

interface Props {
  initialProducts?: ProductWithDetails[];
}

export default function CategoryPage({ initialProducts = [] }: Props) {
  const { slug } = useParams<{ slug: string }>();
  const config = slug ? CATEGORIES[slug] : undefined;

  console.log('[CategoryPage] slug =', JSON.stringify(slug), 'config =', config ? config.slug : 'undefined', 'keys =', Object.keys(CATEGORIES));
  if (!config) {
    return <Navigate to="/" replace />;
  }

  return <HomePage categoryConfig={config} initialProducts={initialProducts} />;
}