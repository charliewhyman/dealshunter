import { BrowserRouter, StaticRouter } from 'react-router-dom';
import { Footer } from '@/components/Footer';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AppRoutes } from '@/AppRoutes';
import type { ProductWithDetails } from '@/types';

interface Props {
  url?: string;
  initialProducts?: ProductWithDetails[];
  unsubscribeToken?: string;
}

export function AppWrapper({
  url = '/',
  initialProducts = [],
  unsubscribeToken = '',
}: Props) {
  const isServer = typeof window === 'undefined';

  const inner = (
    <>
      <ScrollToTop />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <div className="grow">
          <AppRoutes
            initialProducts={initialProducts}
            unsubscribeToken={unsubscribeToken}
          />
        </div>
        <Footer />
      </div>
    </>
  );

  return isServer ? (
    <StaticRouter location={url}>{inner}</StaticRouter>
  ) : (
    <BrowserRouter>{inner}</BrowserRouter>
  );
}