import { Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { type FormEvent, useCallback } from 'react';
import { Header } from './components/Header';
import { HomePage } from './react-pages/HomePage';
import ProductPage from './react-pages/ProductPage';
import { AboutPage } from './react-pages/AboutPage';
import { PrivacyPolicy } from './react-pages/PrivacyPolicy';
import { TermsPage } from './react-pages/TermsPage';
import CategoryPage from './react-pages/CategoryPage';
import type { ProductWithDetails } from './types';

interface Props {
  initialProducts?: ProductWithDetails[];
}

export function AppRoutes({ initialProducts = [] }: Props) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const searchQuery = searchParams.get('search') || '';

  const handleSearchSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const input = form.querySelector('input');
      if (input) {
        const value = input.value;
        if (value) navigate(`/?search=${encodeURIComponent(value)}`);
        else navigate(`/`);
      }
    },
    [navigate]
  );

  return (
    <>
      <Header searchQuery={searchQuery} handleSearchSubmit={handleSearchSubmit} />
      <Routes>
        <Route path="/" element={<HomePage initialProducts={initialProducts} />} />
        <Route path="/collections/:slug" element={<CategoryPage initialProducts={initialProducts} />} />
        <Route path="/products/:productId" element={<ProductPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </>
  );
}