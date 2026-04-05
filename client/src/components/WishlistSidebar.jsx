import { useState } from 'react'
import NewWishlistModal from './NewWishlistModal.jsx'

export default function WishlistSidebar({
  testMode,
  authUser,
  onLogout,
  users,
  selectedUserId,
  onSelectUser,
  wishlists,
  selectedWishlistId,
  onSelectWishlist,
  loadingWishlists,
  onWishlistCreated,
  isOpen,
  onClose,
}) {
  const [showNewWishlistModal, setShowNewWishlistModal] = useState(false)

  const handleWishlistCreated = (wishlist) => {
    setShowNewWishlistModal(false)
    onWishlistCreated(wishlist)
  }

  return (
    <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🎁</span>
          <h1>Wishlist App</h1>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">×</button>
        </div>

        {testMode ? (
          // Test mode: show the user selector dropdown
          <>
            <div className="user-selector-label">Account</div>
            <select
              className="user-select"
              value={selectedUserId || ''}
              onChange={e => onSelectUser(Number(e.target.value))}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </>
        ) : (
          // Auth mode: show logged-in user with logout button
          <div className="sidebar-auth-user">
            <div className="sidebar-auth-name">👤 {authUser?.name}</div>
            <div className="sidebar-auth-email">{authUser?.email}</div>
            <button className="sidebar-logout-btn" onClick={onLogout}>Sign out</button>
          </div>
        )}
      </div>

      <div className="sidebar-body">
        <div className="wishlists-section-header">
          <span className="wishlists-section-title">My Wishlists</span>
          {selectedUserId && (
            <button
              className="btn-new-wishlist"
              onClick={() => setShowNewWishlistModal(true)}
              title="Create new wishlist"
            >
              + New
            </button>
          )}
        </div>

        {loadingWishlists ? (
          <div className="sidebar-empty">Loading…</div>
        ) : wishlists.length === 0 ? (
          <div className="sidebar-empty">No wishlists yet.<br />Create one to get started!</div>
        ) : (
          <ul className="wishlist-list">
            {wishlists.map(wl => (
              <li key={wl.id}>
                <div
                  className={`wishlist-item ${wl.id === selectedWishlistId ? 'active' : ''}`}
                  onClick={() => onSelectWishlist(wl.id)}
                >
                  <span className="wishlist-item-icon">{wl.emoji || '📋'}</span>
                  <div className="wishlist-item-info">
                    <div className="wishlist-item-name">{wl.name}</div>
                    <div className="wishlist-item-count">
                      {wl.item_count === 1 ? '1 item' : `${wl.item_count || 0} items`}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showNewWishlistModal && (
        <NewWishlistModal
          userId={selectedUserId}
          onClose={() => setShowNewWishlistModal(false)}
          onCreated={handleWishlistCreated}
        />
      )}
    </aside>
  )
}
