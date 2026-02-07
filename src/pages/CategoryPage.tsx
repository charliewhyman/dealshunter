import { useParams, Navigate } from 'react-router-dom';
import { CATEGORIES } from '../data/categories';
import { HomePage } from './HomePage';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const config = slug ? CATEGORIES[slug] : undefined;

  if (!config) {
    // Optionally redirect to 404 page or back to home
    return <Navigate to="/" replace />;
  }

  return <HomePage categoryConfig={config} />;
}
