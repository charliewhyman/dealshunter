import { Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { FormEvent, useCallback } from 'react';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsPage } from './pages/TermsPage';
import CategoryPage from './pages/CategoryPage';

export function AppRoutes() {
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
      <Header
        searchQuery={searchQuery}
        handleSearchSubmit={handleSearchSubmit}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/collections/:slug" element={<CategoryPage />} />
        <Route path="/products/:productId" element={<ProductPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </>
  );
}
