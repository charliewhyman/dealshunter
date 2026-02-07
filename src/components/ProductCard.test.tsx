import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import { describe, it, expect } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { ProductWithDetails } from '../types';

// Mock ProductWithDetails type structure
const mockProduct: ProductWithDetails = {
  id: 1,
  title: 'Test Product',
  shop_id: 1,
  shop_name: 'Test Shop',
  created_at: new Date().toISOString(),
  url: 'https://example.com/product',
  description: 'Test description',
  in_stock: true,
  min_price: 100,
  max_discount_percentage: 0,
  on_sale: false,
  images: [
    {
      id: 1,
      src: 'https://example.com/image.jpg',
      alt: 'Test Product',
      position: 1
    }
  ],
  variants: [
    {
        id: 1,
        title: 'Variant 1',
        price: 100,
        discount_percentage: 0,
        available: true
    }
  ],
  tags: ['test'],
  grouped_product_type: 'Test Type',
  vendor: 'Test Vendor'
};

describe('ProductCard', () => {
  const renderProductCard = (product = mockProduct) => {
    return render(
      <BrowserRouter>
        <ProductCard product={product} />
      </BrowserRouter>
    );
  };

  it('renders product title and price', () => {
    renderProductCard();
    expect(screen.getByText('Test Product')).toBeInTheDocument();
    const priceElements = screen.getAllByText((content, element) => {
        return element?.textContent === '$100.00' || content.includes('$100.00')
    });
    expect(priceElements.length).toBeGreaterThan(0);
  });

  it('renders product image with correct alt text', () => {
    renderProductCard();
    const image = screen.getByRole('img');
    // ProductCard component processes the image src, might add query params for resizing
    expect(image).toHaveAttribute('src', expect.stringContaining('https://example.com/image.jpg'));
    expect(image).toHaveAttribute('alt', 'Test Product');
  });
  
  it('renders shop name', () => {
      renderProductCard();
      expect(screen.getByText('Test Shop')).toBeInTheDocument();
  });
});
