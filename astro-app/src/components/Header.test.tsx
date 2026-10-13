import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

describe('Header', () => {
  const defaultProps = {
    searchQuery: '',
    handleSearchSubmit: vi.fn(),
  };

  const renderHeader = (props = {}) => {
    return render(
      <BrowserRouter>
        <Header {...defaultProps} {...props} />
      </BrowserRouter>
    );
  };

  it('renders search input', () => {
    renderHeader();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('calls handleSearchSubmit on form submit', () => {
    renderHeader();
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.submit(input);
    expect(defaultProps.handleSearchSubmit).toHaveBeenCalled();
  });

  it('displays the current search query', () => {
    renderHeader({ searchQuery: 'existing query' });
    const input = screen.getByPlaceholderText(/search/i) as HTMLInputElement;
    expect(input.value).toBe('existing query');
  });
});
