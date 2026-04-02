import { useState, useEffect } from 'react'
import WishlistSidebar from './components/WishlistSidebar.jsx'
import WishlistView from './components/WishlistView.jsx'

export default function App() {
  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [wishlists, setWishlists] = useState([])
  const [selectedWishlistId, setSelectedWishlistId] = useState(null)
  const [selectedWishlist, setSelectedWishlist] = useState(null)
  const [loadingWishlists, setLoadingWishlists] = useState(false)
  const [loadingWishlist, setLoadingWishlist] = useState(false)
  const [error, setError] = useState(null)

  // Fetch all users on mount
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setUsers(data)
        if (data.length > 0) setSelectedUserId(data[0].id)
      })
      .catch(err => setError(err.message))
  }, [])

  // Fetch wishlists when selected user changes
  useEffect(() => {
    if (!selectedUserId) return
    setLoadingWishlists(true)
    setSelectedWishlistId(null)
    setSelectedWishlist(null)

    fetch(`/api/users/${selectedUserId}/wishlists`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setWishlists(data)
        if (data.length > 0) setSelectedWishlistId(data[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingWishlists(false))
  }, [selectedUserId])

  // Fetch selected wishlist with items when selection changes
  useEffect(() => {
    if (!selectedWishlistId) return
    setLoadingWishlist(true)

    fetch(`/api/wishlists/${selectedWishlistId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setSelectedWishlist(data)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingWishlist(false))
  }, [selectedWishlistId])

  const handleWishlistCreated = (newWishlist) => {
    // Refresh wishlists list and select the new one
    setWishlists(prev => [{ ...newWishlist, item_count: 0 }, ...prev])
    setSelectedWishlistId(newWishlist.id)
  }

  const handleItemAdded = (newItem) => {
    setSelectedWishlist(prev => ({
      ...prev,
      items: [newItem, ...(prev.items || [])],
    }))
    // Update item count in wishlists sidebar
    setWishlists(prev =>
      prev.map(w => w.id === selectedWishlistId
        ? { ...w, item_count: (w.item_count || 0) + 1 }
        : w
      )
    )
  }

  const handleItemDeleted = (itemId) => {
    setSelectedWishlist(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== itemId),
    }))
    // Update item count in sidebar
    setWishlists(prev =>
      prev.map(w => w.id === selectedWishlistId
        ? { ...w, item_count: Math.max(0, (w.item_count || 1) - 1) }
        : w
      )
    )
  }

  return (
    <div className="app-layout">
      <WishlistSidebar
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        wishlists={wishlists}
        selectedWishlistId={selectedWishlistId}
        onSelectWishlist={setSelectedWishlistId}
        loadingWishlists={loadingWishlists}
        onWishlistCreated={handleWishlistCreated}
      />
      <main className="main-content">
        {error && (
          <div className="error-banner" style={{ margin: '16px 36px 0' }}>
            {error}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 10, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontWeight: 600 }}
            >
              ×
            </button>
          </div>
        )}
        {!selectedWishlistId ? (
          <div className="no-wishlist-selected">
            <div className="no-wishlist-selected-icon">🎁</div>
            <h2>No wishlist selected</h2>
            <p>Select a wishlist from the sidebar, or create a new one to get started.</p>
          </div>
        ) : (
          <WishlistView
            wishlist={selectedWishlist}
            loading={loadingWishlist}
            wishlistId={selectedWishlistId}
            onItemAdded={handleItemAdded}
            onItemDeleted={handleItemDeleted}
          />
        )}
      </main>
    </div>
  )
}
