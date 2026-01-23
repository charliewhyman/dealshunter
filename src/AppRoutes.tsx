import { Routes, Route, useSearchParams, useNavigate } from 'react-router-dom';
import { ChangeEvent, FormEvent, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsPage } from './pages/TermsPage';

export function AppRoutes() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const searchQuery = searchParams.get('search') || '';
  const debounceRef = useRef<number | null>(null);
  const DEBOUNCE_MS = 300;

  const handleSearchChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        if (value) navigate(`/?search=${encodeURIComponent(value)}`);
        else navigate(`/`);
        debounceRef.current = null;
      }, DEBOUNCE_MS) as unknown as number;
    },
    [navigate]
  );

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
        handleSearchChange={handleSearchChange}
        handleSearchSubmit={handleSearchSubmit}
      />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products/:productId" element={<ProductPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsPage />} />
      </Routes>
    </>
  );
}
