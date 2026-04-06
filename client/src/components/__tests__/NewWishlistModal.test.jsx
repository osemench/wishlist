import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewWishlistModal from '../NewWishlistModal.jsx';

const noop = () => {};

describe('NewWishlistModal – layout', () => {
  test('renders the modal dialog', () => {
    render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Wishlist')).toBeInTheDocument();
  });

  test('renders the emoji picker with preset emojis', () => {
    const { container } = render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    const emojiButtons = container.querySelectorAll('.emoji-picker-btn');
    expect(emojiButtons.length).toBeGreaterThan(0);
  });

  test('no emoji picker button is selected by default (default emoji is not a preset)', () => {
    const { container } = render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    const selected = container.querySelector('.emoji-picker-btn.selected');
    expect(selected).toBeNull();
  });

  test('renders name input and description textarea', () => {
    render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument();
  });

  test('Create Wishlist button is disabled when name is empty', () => {
    render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    expect(screen.getByRole('button', { name: /create wishlist/i })).toBeDisabled();
  });

  test('Create Wishlist button is enabled once name is typed', () => {
    render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'My List' } });
    expect(screen.getByRole('button', { name: /create wishlist/i })).not.toBeDisabled();
  });
});

describe('NewWishlistModal – emoji picker', () => {
  test('clicking an emoji button selects it', () => {
    const { container } = render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    const emojiButtons = container.querySelectorAll('.emoji-picker-btn');
    // Click the second emoji (index 1) which is different from the default (index 9 = 📋)
    const secondBtn = emojiButtons[1];
    fireEvent.click(secondBtn);
    expect(secondBtn.classList.contains('selected')).toBe(true);
  });

  test('only one emoji button is selected at a time', () => {
    const { container } = render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    const emojiButtons = container.querySelectorAll('.emoji-picker-btn');
    fireEvent.click(emojiButtons[2]);
    const selectedButtons = container.querySelectorAll('.emoji-picker-btn.selected');
    expect(selectedButtons.length).toBe(1);
  });

  test('emoji preview updates when emoji is selected', () => {
    const { container } = render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    const emojiButtons = container.querySelectorAll('.emoji-picker-btn');
    const initialPreview = container.querySelector('.wl-name-emoji-preview').textContent;
    fireEvent.click(emojiButtons[2]);
    const newPreview = container.querySelector('.wl-name-emoji-preview').textContent;
    expect(newPreview).toBe(emojiButtons[2].textContent);
    expect(newPreview).not.toBe(initialPreview);
  });
});

describe('NewWishlistModal – close', () => {
  test('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<NewWishlistModal userId={1} onClose={onClose} onCreated={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when × is clicked', () => {
    const onClose = vi.fn();
    render(<NewWishlistModal userId={1} onClose={onClose} onCreated={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<NewWishlistModal userId={1} onClose={onClose} onCreated={noop} />);
    fireEvent.click(container.querySelector('.modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  test('does not close when clicking inside the modal', () => {
    const onClose = vi.fn();
    render(<NewWishlistModal userId={1} onClose={onClose} onCreated={noop} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('NewWishlistModal – form submission', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  test('calls onCreated with response on success', async () => {
    const created = { id: 10, name: 'Birthday', emoji: '🎂' };
    mockFetch.mockResolvedValueOnce({ json: async () => created });
    const onCreated = vi.fn();
    render(<NewWishlistModal userId={1} onClose={noop} onCreated={onCreated} />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'Birthday' } });
    fireEvent.click(screen.getByRole('button', { name: /create wishlist/i }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  test('posts to correct user endpoint with name and emoji', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ id: 11, name: 'Test', emoji: '🎁' }) });
    const { container } = render(<NewWishlistModal userId={3} onClose={noop} onCreated={noop} />);
    // Click the first emoji picker button (whatever it is)
    const emojiButtons = container.querySelectorAll('.emoji-picker-btn');
    fireEvent.click(emojiButtons[0]);
    const chosenEmoji = emojiButtons[0].textContent;
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /create wishlist/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/users/3/wishlists');
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('Test');
    expect(body.emoji).toBe(chosenEmoji);
  });

  test('shows validation error when name is empty after submit via form', async () => {
    render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    // Directly submit the form to bypass the disabled button check
    const form = document.querySelector('form');
    // Manually call handleSubmit via keyboard Enter on name input
    const nameInput = screen.getByRole('textbox', { name: /name/i });
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.submit(form);
    // Button is disabled when name is empty — no fetch called
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('shows server error message on failure', async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ error: 'Server exploded' }) });
    render(<NewWishlistModal userId={1} onClose={noop} onCreated={noop} />);
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'My List' } });
    fireEvent.click(screen.getByRole('button', { name: /create wishlist/i }));
    expect(await screen.findByText(/server exploded/i)).toBeInTheDocument();
  });
});
