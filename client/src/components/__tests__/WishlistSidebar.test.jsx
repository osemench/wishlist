import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WishlistSidebar from '../WishlistSidebar.jsx';

const noop = () => {};

const baseProps = {
  testMode: true,
  authUser: null,
  onLogout: noop,
  users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
  selectedUserId: 1,
  onSelectUser: noop,
  wishlists: [],
  selectedWishlistId: null,
  onSelectWishlist: noop,
  loadingWishlists: false,
  onWishlistCreated: noop,
  isOpen: false,
  onClose: noop,
};

const sampleWishlists = [
  { id: 1, name: 'Birthday', emoji: '🎂', item_count: 3 },
  { id: 2, name: 'Home Office', emoji: null, item_count: 1 },
];

// ─── Test mode layout ─────────────────────────────────────────────────────────

describe('WishlistSidebar – test mode', () => {
  test('renders user dropdown in test mode', () => {
    render(<WishlistSidebar {...baseProps} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Bob' })).toBeInTheDocument();
  });

  test('user dropdown reflects selectedUserId', () => {
    render(<WishlistSidebar {...baseProps} selectedUserId={2} />);
    expect(screen.getByRole('combobox').value).toBe('2');
  });

  test('calls onSelectUser with numeric id on change', () => {
    const onSelectUser = vi.fn();
    render(<WishlistSidebar {...baseProps} onSelectUser={onSelectUser} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(onSelectUser).toHaveBeenCalledWith(2);
  });

  test('does not show sign-out button in test mode', () => {
    render(<WishlistSidebar {...baseProps} />);
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });
});

// ─── Auth mode layout ─────────────────────────────────────────────────────────

describe('WishlistSidebar – auth mode', () => {
  const authProps = {
    ...baseProps,
    testMode: false,
    authUser: { name: 'Alice', email: 'alice@example.com' },
    users: [],
  };

  test('shows logged-in user name and email', () => {
    const { container } = render(<WishlistSidebar {...authProps} />);
    expect(container.querySelector('.sidebar-auth-name').textContent).toContain('Alice');
    expect(container.querySelector('.sidebar-auth-email').textContent).toBe('alice@example.com');
  });

  test('shows sign-out button that calls onLogout', () => {
    const onLogout = vi.fn();
    render(<WishlistSidebar {...authProps} onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  test('does not render user dropdown in auth mode', () => {
    render(<WishlistSidebar {...authProps} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

// ─── Wishlists list ───────────────────────────────────────────────────────────

describe('WishlistSidebar – wishlist list', () => {
  test('shows loading state', () => {
    render(<WishlistSidebar {...baseProps} loadingWishlists={true} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('shows empty state when no wishlists', () => {
    render(<WishlistSidebar {...baseProps} wishlists={[]} loadingWishlists={false} />);
    expect(screen.getByText(/no wishlists yet/i)).toBeInTheDocument();
  });

  test('renders wishlist names', () => {
    render(<WishlistSidebar {...baseProps} wishlists={sampleWishlists} />);
    expect(screen.getByText('Birthday')).toBeInTheDocument();
    expect(screen.getByText('Home Office')).toBeInTheDocument();
  });

  test('renders emoji when set', () => {
    render(<WishlistSidebar {...baseProps} wishlists={sampleWishlists} />);
    expect(screen.getByText('🎂')).toBeInTheDocument();
  });

  test('falls back to 📋 when emoji is null', () => {
    render(<WishlistSidebar {...baseProps} wishlists={sampleWishlists} />);
    expect(screen.getByText('📋')).toBeInTheDocument();
  });

  test('shows correct item count (singular)', () => {
    render(<WishlistSidebar {...baseProps} wishlists={sampleWishlists} />);
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  test('shows correct item count (plural)', () => {
    render(<WishlistSidebar {...baseProps} wishlists={sampleWishlists} />);
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  test('marks selected wishlist as active', () => {
    const { container } = render(
      <WishlistSidebar {...baseProps} wishlists={sampleWishlists} selectedWishlistId={1} />
    );
    const items = container.querySelectorAll('.wishlist-item');
    expect(items[0]).toHaveClass('active');
    expect(items[1]).not.toHaveClass('active');
  });

  test('calls onSelectWishlist with wishlist id on click', () => {
    const onSelectWishlist = vi.fn();
    render(<WishlistSidebar {...baseProps} wishlists={sampleWishlists} onSelectWishlist={onSelectWishlist} />);
    fireEvent.click(screen.getByText('Birthday'));
    expect(onSelectWishlist).toHaveBeenCalledWith(1);
  });
});

// ─── New wishlist button ──────────────────────────────────────────────────────

describe('WishlistSidebar – new wishlist', () => {
  test('shows + New button when a user is selected', () => {
    render(<WishlistSidebar {...baseProps} selectedUserId={1} />);
    expect(screen.getByRole('button', { name: /\+ new/i })).toBeInTheDocument();
  });

  test('does not show + New button when no user selected', () => {
    render(<WishlistSidebar {...baseProps} selectedUserId={null} />);
    expect(screen.queryByRole('button', { name: /\+ new/i })).not.toBeInTheDocument();
  });

  test('opens NewWishlistModal when + New is clicked', () => {
    render(<WishlistSidebar {...baseProps} selectedUserId={1} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

// ─── Sidebar open/close ───────────────────────────────────────────────────────

describe('WishlistSidebar – open/close', () => {
  test('has sidebar--open class when isOpen=true', () => {
    const { container } = render(<WishlistSidebar {...baseProps} isOpen={true} />);
    expect(container.querySelector('aside')).toHaveClass('sidebar--open');
  });

  test('does not have sidebar--open class when isOpen=false', () => {
    const { container } = render(<WishlistSidebar {...baseProps} isOpen={false} />);
    expect(container.querySelector('aside')).not.toHaveClass('sidebar--open');
  });

  test('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<WishlistSidebar {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
