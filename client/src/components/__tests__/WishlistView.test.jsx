import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WishlistView from '../WishlistView.jsx';

const noop = () => {};

const baseWishlist = {
  id: 1,
  name: 'Birthday',
  description: 'My birthday list',
  emoji: '🎂',
  items: [
    { id: 1, name: 'Headphones', price: 149.99, purchase_url: 'https://shop.com', image_url: null, is_purchased: 0 },
    { id: 2, name: 'Book', price: 19.99, purchase_url: null, image_url: null, is_purchased: 1 },
  ],
};

describe('WishlistView – rendering', () => {
  test('shows loading spinner when loading=true', () => {
    const { container } = render(
      <WishlistView wishlist={null} loading={true} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />
    );
    expect(container.querySelector('.loading-state')).toBeInTheDocument();
  });

  test('renders nothing when wishlist is null and not loading', () => {
    const { container } = render(
      <WishlistView wishlist={null} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders wishlist name and description', () => {
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    expect(screen.getByText('Birthday')).toBeInTheDocument();
    expect(screen.getByText('My birthday list')).toBeInTheDocument();
  });

  test('renders wishlist emoji', () => {
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    expect(screen.getByText('🎂', { selector: '.wishlist-view-emoji' })).toBeInTheDocument();
  });

  test('does not render emoji span when emoji is absent', () => {
    const wl = { ...baseWishlist, emoji: null };
    const { container } = render(
      <WishlistView wishlist={wl} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />
    );
    expect(container.querySelector('.wishlist-view-emoji')).not.toBeInTheDocument();
  });

  test('renders item cards for each item', () => {
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    expect(screen.getByText('Headphones')).toBeInTheDocument();
    expect(screen.getByText('Book')).toBeInTheDocument();
  });

  test('shows empty state when items array is empty', () => {
    const wl = { ...baseWishlist, items: [] };
    render(<WishlistView wishlist={wl} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    expect(screen.getByText(/this wishlist is empty/i)).toBeInTheDocument();
  });

  test('hides is_purchased badge when purchases panel is closed', () => {
    // When purchases is null, items are rendered with is_purchased forced to false
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    expect(screen.queryByText('Purchased')).not.toBeInTheDocument();
  });
});

describe('WishlistView – Add Item modal', () => {
  test('opens Add Item modal when + Add Item is clicked', () => {
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Item' })).toBeInTheDocument();
  });

  test('closes Add Item modal when × is clicked', async () => {
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('WishlistView – Share', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('alert', vi.fn());
  });

  test('clicking Share posts to /api/wishlists/:id/share and shows link panel', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ token: 'abc123' }) });
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    await waitFor(() => expect(screen.getByText(/share link/i)).toBeInTheDocument());
    const input = screen.getByRole('textbox', { hidden: true });
    expect(input.value).toContain('/share/abc123');
  });

  test('share link panel can be dismissed', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ token: 'tok' }) });
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    await waitFor(() => expect(screen.getByText(/share link/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(screen.queryByText(/share link/i)).not.toBeInTheDocument();
  });
});

describe('WishlistView – Purchases panel', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('alert', vi.fn());
  });

  test('clicking Purchases loads and shows the panel', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => [
        { id: 1, item_id: 2, item_name: 'Book', purchaser_name: 'Bob' },
      ],
    });
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /purchases/i }));
    await waitFor(() => expect(screen.getByText(/purchases/i, { selector: '.purchases-panel-title' })).toBeInTheDocument());
    // Without "show names" checked, purchaser shows as "Someone"
    expect(screen.getByText('Someone')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  test('enabling Show names reveals purchaser names', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => [{ id: 1, item_id: 2, item_name: 'Book', purchaser_name: 'Bob' }],
    });
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /purchases/i }));
    await waitFor(() => expect(screen.getByLabelText(/show names/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/show names/i));
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('shows empty purchases message when no purchases', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => [] });
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /purchases/i }));
    await waitFor(() => expect(screen.getByText(/no items have been purchased/i)).toBeInTheDocument());
  });

  test('toggling Purchases button again hides the panel', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => [] });
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /purchases/i }));
    await waitFor(() => expect(screen.getByText(/no items have been purchased/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /hide/i }));
    expect(screen.queryByText(/no items have been purchased/i)).not.toBeInTheDocument();
  });

  test('shows purchased badge on items when purchases panel is open', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => [] });
    render(<WishlistView wishlist={baseWishlist} loading={false} wishlistId={1} onItemAdded={noop} onItemDeleted={noop} />);
    // Before opening purchases: badge hidden
    expect(screen.queryByText('Purchased')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /purchases/i }));
    await waitFor(() => expect(screen.getByText(/no items have been purchased/i)).toBeInTheDocument());
    // Item 2 has is_purchased=1 — badge now visible
    expect(screen.getByText('Purchased')).toBeInTheDocument();
  });
});
