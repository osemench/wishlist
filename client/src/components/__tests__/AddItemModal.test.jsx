import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddItemModal from '../AddItemModal.jsx';

const noop = () => {};

describe('AddItemModal – layout', () => {
  test('renders the modal dialog', () => {
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Item' })).toBeInTheDocument();
  });

  test('starts on the Manual tab', () => {
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    expect(screen.getByRole('button', { name: /manual/i })).toHaveClass('active');
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  test('switches to From URL tab and shows URL input', () => {
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    expect(screen.getByRole('button', { name: /from url/i })).toHaveClass('active');
    expect(screen.getByPlaceholderText(/amazon\.com/i)).toBeInTheDocument();
  });

  test('Fetch button is disabled when URL is empty', () => {
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    expect(screen.getByRole('button', { name: /^fetch$/i })).toBeDisabled();
  });

  test('Fetch button is enabled once URL is typed', () => {
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    fireEvent.change(screen.getByPlaceholderText(/amazon\.com/i), { target: { value: 'https://example.com' } });
    expect(screen.getByRole('button', { name: /^fetch$/i })).not.toBeDisabled();
  });

  test('Add Item button is disabled when name is empty', () => {
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled();
  });

  test('Add Item button is enabled when name is filled', () => {
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Widget' } });
    expect(screen.getByRole('button', { name: /add item/i })).not.toBeDisabled();
  });
});

describe('AddItemModal – close', () => {
  test('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<AddItemModal wishlistId={1} onClose={onClose} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when × is clicked', () => {
    const onClose = vi.fn();
    render(<AddItemModal wishlistId={1} onClose={onClose} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when overlay background is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<AddItemModal wishlistId={1} onClose={onClose} onItemAdded={noop} />);
    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddItemModal – manual form submission', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  // The submit button is outside the form (uses form= attribute).
  // Use fireEvent.submit(form) to trigger handleSubmit directly.
  const submitForm = (container) => fireEvent.submit(container.querySelector('#add-item-form'));

  test('calls onItemAdded with server response on success', async () => {
    const newItem = { id: 5, name: 'Widget', price: 9.99, is_purchased: 0 };
    mockFetch.mockResolvedValueOnce({ json: async () => newItem });
    const onItemAdded = vi.fn();
    const { container } = render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={onItemAdded} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Widget' } });
    submitForm(container);
    await waitFor(() => expect(onItemAdded).toHaveBeenCalledWith(newItem));
  });

  test('posts to correct wishlist endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ id: 6, name: 'Gadget' }) });
    const { container } = render(<AddItemModal wishlistId={42} onClose={noop} onItemAdded={noop} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Gadget' } });
    submitForm(container);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(mockFetch.mock.calls[0][0]).toBe('/api/wishlists/42/items');
  });

  test('sends price as float and purchase_url in body', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ id: 7, name: 'Thing' }) });
    const { container } = render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Thing' } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '19.99' } });
    fireEvent.change(screen.getByLabelText(/buy link/i), { target: { value: 'https://shop.com' } });
    submitForm(container);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.price).toBe(19.99);
    expect(body.purchase_url).toBe('https://shop.com');
  });

  test('shows server error on failure', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ error: 'Wishlist not found' }) });
    const { container } = render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Widget' } });
    submitForm(container);
    expect(await screen.findByText(/wishlist not found/i)).toBeInTheDocument();
  });
});

describe('AddItemModal – URL scraping', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  test('calls /api/scrape and switches to manual tab on success', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        name: 'Cool Gadget',
        description: 'Very cool',
        price: 49.99,
        purchase_url: 'https://shop.com/gadget',
        candidate_images: [],
      }),
    });
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    fireEvent.change(screen.getByPlaceholderText(/amazon\.com/i), { target: { value: 'https://shop.com/gadget' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /manual/i })).toHaveClass('active'));
    expect(screen.getByDisplayValue('Cool Gadget')).toBeInTheDocument();
    expect(screen.getByDisplayValue('49.99')).toBeInTheDocument();
  });

  test('shows success notice after scrape', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        name: 'Widget', description: '', price: null, purchase_url: '', candidate_images: [],
      }),
    });
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    fireEvent.change(screen.getByPlaceholderText(/amazon\.com/i), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    await waitFor(() => expect(screen.getByText(/product details fetched/i)).toBeInTheDocument());
  });

  test('shows error notice when scrape fails', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ error: 'Could not reach host' }),
    });
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    fireEvent.change(screen.getByPlaceholderText(/amazon\.com/i), { target: { value: 'https://bad.host' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    await waitFor(() => expect(screen.getByText(/could not reach host/i)).toBeInTheDocument());
  });

  test('shows image picker when candidate images are returned', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        name: 'Widget', description: '', price: null, purchase_url: '',
        candidate_images: [
          { url: 'https://example.com/img1.jpg', score: 90 },
          { url: 'https://example.com/img2.jpg', score: 70 },
        ],
      }),
    });
    render(<AddItemModal wishlistId={1} onClose={noop} onItemAdded={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /from url/i }));
    fireEvent.change(screen.getByPlaceholderText(/amazon\.com/i), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    // "None" button appears in image picker after scrape returns candidates
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^none$/i })).toBeInTheDocument();
    });
  });
});
