import { useState } from 'react'
import ItemCard from './ItemCard.jsx'
import AddItemModal from './AddItemModal.jsx'

export default function WishlistView({ wishlist, loading, wishlistId, onItemAdded, onItemDeleted }) {
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [shareUrl, setShareUrl] = useState(null)
  const [sharing, setSharing] = useState(false)
  // purchases panel: null = hidden, array = loaded purchases
  const [purchases, setPurchases] = useState(null)
  const [loadingPurchases, setLoadingPurchases] = useState(false)
  const [showPurchaserNames, setShowPurchaserNames] = useState(false)

  const handleItemAdded = (item) => {
    setShowAddItemModal(false)
    onItemAdded(item)
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      const res = await fetch(`/api/wishlists/${wishlistId}/share`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setShareUrl(`${window.location.origin}/share/${data.token}`)
    } catch (err) {
      alert('Could not generate share link: ' + err.message)
    } finally {
      setSharing(false)
    }
  }

  const handleTogglePurchases = async () => {
    if (purchases !== null) { setPurchases(null); return }
    setLoadingPurchases(true)
    try {
      const res = await fetch(`/api/wishlists/${wishlistId}/purchases`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPurchases(data)
    } catch (err) {
      alert('Could not load purchases: ' + err.message)
    } finally {
      setLoadingPurchases(false)
    }
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

  // Build a map of item_id → [purchaserName, …] for the purchases panel
  const purchasersByItem = {}
  if (purchases) {
    for (const p of purchases) {
      if (!purchasersByItem[p.item_id]) purchasersByItem[p.item_id] = []
      purchasersByItem[p.item_id].push(p.purchaser_name)
    }
  }

  return (
    <div className="wishlist-view">
      <div className="wishlist-view-header">
        <div className="wishlist-view-title-area">
          <h2 className="wishlist-view-title">
            {wishlist.emoji && <span className="wishlist-view-emoji">{wishlist.emoji}</span>}
            {wishlist.name}
          </h2>
          {wishlist.description && (
            <p className="wishlist-view-description">{wishlist.description}</p>
          )}
        </div>
        <div className="wishlist-view-actions">
          <button
            className="btn-icon-action"
            onClick={handleTogglePurchases}
            disabled={loadingPurchases}
            title={purchases ? 'Hide purchases' : 'See who purchased items'}
          >
            {loadingPurchases ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : '👁'}
            <span>{purchases ? 'Hide' : 'Purchases'}</span>
          </button>
          <button className="btn-icon-action" onClick={handleShare} disabled={sharing} title="Share this list">
            {sharing ? <span className="spinner spinner-dark" style={{ width: 14, height: 14 }} /> : '🔗'}
            <span>Share</span>
          </button>
          <button className="btn-add-item" onClick={() => setShowAddItemModal(true)}>
            <span>+</span> Add Item
          </button>
        </div>
      </div>

      {/* Share link panel */}
      {shareUrl && (
        <div className="share-link-panel">
          <span className="share-link-label">Share link:</span>
          <input className="share-link-input" value={shareUrl} readOnly onClick={e => e.target.select()} />
          <button className="btn-copy" onClick={() => { navigator.clipboard.writeText(shareUrl) }}>Copy</button>
          <button className="btn-close-panel" onClick={() => setShareUrl(null)}>×</button>
        </div>
      )}

      {/* Purchases panel */}
      {purchases !== null && (
        <div className="purchases-panel">
          <div className="purchases-panel-header">
            <span className="purchases-panel-title">Purchases</span>
            <label className="purchases-reveal-toggle">
              <input
                type="checkbox"
                checked={showPurchaserNames}
                onChange={e => setShowPurchaserNames(e.target.checked)}
              />
              <span>Show names</span>
            </label>
          </div>
          {purchases.length === 0 ? (
            <p className="purchases-empty">No items have been purchased yet.</p>
          ) : (
            <ul className="purchases-list">
              {purchases.map(p => (
                <li key={p.id} className="purchases-list-item">
                  <span className="purchases-item-name">{p.item_name}</span>
                  <span className="purchases-purchaser">
                    {showPurchaserNames ? p.purchaser_name : 'Someone'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
              item={purchases !== null ? item : { ...item, is_purchased: false }}
              onDelete={onItemDeleted}
              purchasers={showPurchaserNames ? (purchasersByItem[item.id] || null) : null}
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
