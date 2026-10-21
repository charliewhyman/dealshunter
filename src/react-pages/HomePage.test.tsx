import { render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

// Mock dependencies
vi.mock('../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock('../hooks/useProductPricing', () => ({
  useProductPricing: vi.fn(() => ({
    variantPrice: 100,
    compareAtPrice: 120,
    loading: false,
  })),
}));

// Mock ProductCard to simplify testing
vi.mock('../components/ProductCard', () => ({
  ProductCard: ({ product }: { product: { title: string } }) => (
    <div data-testid="product-card">{product.title}</div>
  ),
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderHomePage = () => {
    return render(
      <BrowserRouter>
        <HomePage />
      </BrowserRouter>
    );
  };

  it('renders filters section', () => {
    renderHomePage();
    expect(screen.getAllByText(/Filters/i)[0]).toBeInTheDocument();
  });
});
