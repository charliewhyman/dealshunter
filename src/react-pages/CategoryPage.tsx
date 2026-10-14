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

  if (!config) {
    return <Navigate to="/" replace />;
  }

  return <HomePage categoryConfig={config} initialProducts={initialProducts} />;
}