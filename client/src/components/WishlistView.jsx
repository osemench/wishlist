import { useState } from 'react'
import ItemCard from './ItemCard.jsx'
import AddItemModal from './AddItemModal.jsx'

export default function WishlistView({ wishlist, loading, wishlistId, onItemAdded, onItemDeleted }) {
  const [showAddItemModal, setShowAddItemModal] = useState(false)

  const handleItemAdded = (item) => {
    setShowAddItemModal(false)
    onItemAdded(item)
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner spinner-dark"></div>
        <span>Loading wishlist…</span>
      </div>
    )
  }

  if (!wishlist) return null

  return (
    <div className="wishlist-view">
      <div className="wishlist-view-header">
        <div className="wishlist-view-title-area">
          <h2 className="wishlist-view-title">{wishlist.name}</h2>
          {wishlist.description && (
            <p className="wishlist-view-description">{wishlist.description}</p>
          )}
        </div>
        <button className="btn-add-item" onClick={() => setShowAddItemModal(true)}>
          <span>+</span> Add Item
        </button>
      </div>

      {!wishlist.items || wishlist.items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛍️</div>
          <div className="empty-state-title">This wishlist is empty</div>
          <div className="empty-state-text">
            Add items manually or paste a product URL to auto-fill details.
          </div>
        </div>
      ) : (
        <div className="items-grid">
          {wishlist.items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onDelete={onItemDeleted}
            />
          ))}
        </div>
      )}

      {showAddItemModal && (
        <AddItemModal
          wishlistId={wishlistId}
          onClose={() => setShowAddItemModal(false)}
          onItemAdded={handleItemAdded}
        />
      )}
    </div>
  )
}
