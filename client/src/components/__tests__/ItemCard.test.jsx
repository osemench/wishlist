import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ItemCard from '../ItemCard.jsx';

const baseItem = {
  id: 1,
  name: 'Fancy Headphones',
  description: 'Great sound quality',
  price: 149.99,
  purchase_url: 'https://example.com/headphones',
  image_url: '/api/items/1/image',
  is_purchased: 0,
};

describe('ItemCard rendering', () => {
  test('renders item name', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    expect(screen.getByText('Fancy Headphones')).toBeInTheDocument();
  });

  test('renders formatted price', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    expect(screen.getByText('$149.99')).toBeInTheDocument();
  });

  test('renders "No price" when price is null', () => {
    render(<ItemCard item={{ ...baseItem, price: null }} onDelete={() => {}} />);
    expect(screen.getByText('No price')).toBeInTheDocument();
  });

  test('renders description', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    expect(screen.getByText('Great sound quality')).toBeInTheDocument();
  });

  test('renders buy link when purchase_url is set', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    const link = screen.getByRole('link', { name: /buy/i });
    expect(link).toHaveAttribute('href', 'https://example.com/headphones');
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('does not render buy link when purchase_url is absent', () => {
    render(<ItemCard item={{ ...baseItem, purchase_url: null }} onDelete={() => {}} />);
    expect(screen.queryByRole('link', { name: /buy/i })).not.toBeInTheDocument();
  });

  test('renders image when image_url is set', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    const img = screen.getByRole('img', { name: /fancy headphones/i });
    expect(img).toHaveAttribute('src', '/api/items/1/image');
  });

  test('renders placeholder when image_url is absent', () => {
    render(<ItemCard item={{ ...baseItem, image_url: null }} onDelete={() => {}} />);
    expect(screen.getByText('🎁')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /fancy headphones/i })).not.toBeInTheDocument();
  });

  test('falls back to placeholder on image error', async () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    const img = screen.getByRole('img', { name: /fancy headphones/i });
    fireEvent.error(img);
    await waitFor(() => {
      expect(screen.getByText('🎁')).toBeInTheDocument();
    });
  });

  test('does not show purchased badge when not purchased', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    expect(screen.queryByText('Purchased')).not.toBeInTheDocument();
  });

  test('shows purchased badge when is_purchased is truthy', () => {
    render(<ItemCard item={{ ...baseItem, is_purchased: 1 }} onDelete={() => {}} />);
    expect(screen.getByText('Purchased')).toBeInTheDocument();
  });

  test('adds purchased CSS class when purchased', () => {
    const { container } = render(
      <ItemCard item={{ ...baseItem, is_purchased: 1 }} onDelete={() => {}} />
    );
    expect(container.firstChild).toHaveClass('item-card--purchased');
  });

  test('does not add purchased CSS class when not purchased', () => {
    const { container } = render(<ItemCard item={baseItem} onDelete={() => {}} />);
    expect(container.firstChild).not.toHaveClass('item-card--purchased');
  });
});

describe('ItemCard purchasers', () => {
  test('shows purchaser names when provided', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} purchasers={['Alice', 'Bob']} />);
    expect(screen.getByText(/Alice, Bob/)).toBeInTheDocument();
  });

  test('does not render purchasers section when list is empty', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} purchasers={[]} />);
    expect(screen.queryByText(/Bought by/i)).not.toBeInTheDocument();
  });

  test('does not render purchasers section when prop is absent', () => {
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    expect(screen.queryByText(/Bought by/i)).not.toBeInTheDocument();
  });
});

describe('ItemCard delete', () => {
  beforeEach(() => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('fetch', vi.fn());
  });

  test('calls onDelete with item id after successful delete', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => ({ success: true, id: 1 }),
    });
    const onDelete = vi.fn();
    render(<ItemCard item={baseItem} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /remove item/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1));
  });

  test('does not call onDelete when confirm is cancelled', async () => {
    confirm.mockReturnValueOnce(false);
    const onDelete = vi.fn();
    render(<ItemCard item={baseItem} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: /remove item/i }));
    expect(fetch).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('shows alert and re-enables button on fetch error', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => ({ error: 'Not found' }),
    });
    render(<ItemCard item={baseItem} onDelete={() => {}} />);
    const btn = screen.getByRole('button', { name: /remove item/i });
    fireEvent.click(btn);
    await waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringContaining('Not found')));
    expect(btn).not.toBeDisabled();
  });
});
