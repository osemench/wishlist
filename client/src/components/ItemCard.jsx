import { useState } from 'react'

export default function ItemCard({ item, onDelete }) {
  const [deleting, setDeleting] = useState(false)
  const [imgError, setImgError] = useState(false)

  const handleDelete = async () => {
    if (!confirm(`Remove "${item.name}" from this wishlist?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onDelete(item.id)
    } catch (err) {
      alert('Failed to delete item: ' + err.message)
      setDeleting(false)
    }
  }

  const formatPrice = (price) => {
    if (price == null) return null
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(price)
  }

  return (
    <div className="item-card">
      <div className="item-card-image-wrapper">
        {item.image_url && !imgError ? (
          <img
            className="item-card-image"
            src={item.image_url}
            alt={item.name}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="item-card-image-placeholder">🎁</div>
        )}

        <button
          className="item-card-delete"
          onClick={handleDelete}
          disabled={deleting}
          title="Remove item"
          aria-label="Remove item"
        >
          {deleting ? '…' : '×'}
        </button>
      </div>

      <div className="item-card-body">
        <div className="item-card-name">{item.name}</div>
        {item.description && (
          <div className="item-card-description">{item.description}</div>
        )}

        <div className="item-card-footer">
          {item.price != null ? (
            <span className="item-card-price">{formatPrice(item.price)}</span>
          ) : (
            <span className="item-card-price-empty">No price</span>
          )}

          {item.purchase_url ? (
            <a
              className="item-card-buy-link"
              href={item.purchase_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy →
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
