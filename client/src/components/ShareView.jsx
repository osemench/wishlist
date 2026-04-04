import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

// Identity persisted in localStorage so the user doesn't have to re-enter
// across page reloads. Shape: { type: 'user', id: number } | { type: 'anon', name: string }
function loadIdentity() {
  try { return JSON.parse(localStorage.getItem('wishlist_identity')) || null } catch { return null }
}
function saveIdentity(identity) {
  localStorage.setItem('wishlist_identity', JSON.stringify(identity))
}

function viewerParams(identity) {
  if (!identity) return {}
  if (identity.type === 'user') return { viewer_user_id: identity.id }
  return { viewer_anon_name: identity.name }
}

function purchaseBody(identity) {
  if (!identity) return {}
  if (identity.type === 'user') return { user_id: identity.id }
  return { anon_name: identity.name }
}

export default function ShareView() {
  const { token } = useParams()
  const [wishlist, setWishlist] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // identity: null = not set yet, object = set
  const [identity, setIdentity] = useState(loadIdentity)
  const [users, setUsers] = useState([])
  const [showIdentityPicker, setShowIdentityPicker] = useState(false)
  const [anonInput, setAnonInput] = useState('')
  const [pendingItemId, setPendingItemId] = useState(null) // item clicked before identity set

  // Fetch all users for the "I am…" selector
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (!data.error) setUsers(data)
    })
  }, [])

  const fetchWishlist = (id = identity) => {
    setLoading(true)
    const params = new URLSearchParams(viewerParams(id))
    fetch(`/api/share/${token}?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setWishlist(data)
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }

  useEffect(() => { fetchWishlist() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyIdentity = (newIdentity) => {
    setIdentity(newIdentity)
    saveIdentity(newIdentity)
    setShowIdentityPicker(false)
    // Re-fetch so my_purchase_id fields are populated
    fetchWishlist(newIdentity)
    // If user clicked purchase before identity was set, trigger it now
    if (pendingItemId) {
      handlePurchaseWithIdentity(pendingItemId, newIdentity)
      setPendingItemId(null)
    }
  }

  const handlePurchaseWithIdentity = async (itemId, id) => {
    const res = await fetch(`/api/items/${itemId}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseBody(id)),
    })
    const data = await res.json()
    if (data.error) { alert(data.error); return }
    setWishlist(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId
          ? { ...item, is_purchased: 1, my_purchase_id: data.id }
          : item
      ),
    }))
  }

  const handlePurchase = (itemId) => {
    if (!identity) {
      setPendingItemId(itemId)
      setShowIdentityPicker(true)
      return
    }
    handlePurchaseWithIdentity(itemId, identity)
  }

  const handleUnpurchase = async (itemId, purchaseId) => {
    const res = await fetch(`/api/purchases/${purchaseId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(purchaseBody(identity)),
    })
    const data = await res.json()
    if (data.error) { alert(data.error); return }
    setWishlist(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId
          ? { ...item, is_purchased: 0, my_purchase_id: null }
          : item
      ),
    }))
  }

  const identityLabel = identity
    ? identity.type === 'user'
      ? users.find(u => u.id === identity.id)?.name || 'Unknown user'
      : identity.name
    : null

  if (loading) return (
    <div className="share-page">
      <div className="loading-state"><div className="spinner spinner-dark" /><span>Loading wishlist…</span></div>
    </div>
  )

  if (error) return (
    <div className="share-page">
      <div className="share-header">
        <span className="share-header-logo">🎁</span>
        <span>Wishlist App</span>
      </div>
      <div className="share-error">
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
        <h2>Link not found</h2>
        <p>{error}</p>
      </div>
    </div>
  )

  return (
    <div className="share-page">
      <div className="share-header">
        <span className="share-header-logo">🎁</span>
        <span className="share-header-app">Wishlist App</span>
        <div className="share-header-identity">
          {identityLabel
            ? <button className="share-identity-btn" onClick={() => setShowIdentityPicker(true)}>👤 {identityLabel}</button>
            : <button className="share-identity-btn" onClick={() => setShowIdentityPicker(true)}>Set your name</button>
          }
        </div>
      </div>

      <div className="share-body">
        <div className="share-wishlist-title">{wishlist.name}</div>
        {wishlist.description && <p className="share-wishlist-desc">{wishlist.description}</p>}

        {wishlist.items.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <div className="empty-state-icon">🛍️</div>
            <div className="empty-state-title">Nothing on this list yet</div>
          </div>
        ) : (
          <div className="share-items-grid">
            {wishlist.items.map(item => (
              <ShareItemCard
                key={item.id}
                item={item}
                onPurchase={handlePurchase}
                onUnpurchase={handleUnpurchase}
              />
            ))}
          </div>
        )}
      </div>

      {showIdentityPicker && (
        <IdentityPickerModal
          users={users}
          currentIdentity={identity}
          anonInput={anonInput}
          onAnonInputChange={setAnonInput}
          onClose={() => { setShowIdentityPicker(false); setPendingItemId(null) }}
          onSelectUser={u => applyIdentity({ type: 'user', id: u.id })}
          onSelectAnon={() => {
            if (anonInput.trim()) applyIdentity({ type: 'anon', name: anonInput.trim() })
          }}
        />
      )}
    </div>
  )
}

function ShareItemCard({ item, onPurchase, onUnpurchase }) {
  const [imgError, setImgError] = useState(false)
  const purchased = !!item.is_purchased
  const mine = item.my_purchase_id != null

  const formatPrice = (price) => price == null ? null :
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)

  return (
    <div className={`share-item-card${purchased ? ' share-item-card--purchased' : ''}`}>
      <div className="item-card-image-wrapper">
        {item.image_url && !imgError ? (
          <img className="item-card-image" src={item.image_url} alt={item.name}
            onError={() => setImgError(true)} loading="lazy" />
        ) : (
          <div className="item-card-image-placeholder">🎁</div>
        )}
        {purchased && (
          <div className="share-purchased-badge">
            {mine ? '✓ You claimed this' : 'Claimed'}
          </div>
        )}
      </div>

      <div className="item-card-body">
        <div className="item-card-name">{item.name}</div>
        {item.description && <div className="item-card-description">{item.description}</div>}

        <div className="item-card-footer">
          {item.price != null
            ? <span className="item-card-price">{formatPrice(item.price)}</span>
            : <span className="item-card-price-empty">No price</span>}
          {item.purchase_url && (
            <a className="item-card-buy-link" href={item.purchase_url}
              target="_blank" rel="noopener noreferrer">Buy →</a>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          {mine ? (
            <button className="share-btn-unpurchase"
              onClick={() => onUnpurchase(item.id, item.my_purchase_id)}>
              ✓ Claimed — undo
            </button>
          ) : !purchased ? (
            <button className="share-btn-purchase" onClick={() => onPurchase(item.id)}>
              I'm buying this
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function IdentityPickerModal({ users, currentIdentity, anonInput, onAnonInputChange, onClose, onSelectUser, onSelectAnon }) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">Who are you?</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
            Identify yourself so the list owner knows who claimed items.
          </p>

          {users.length > 0 && (
            <>
              <div className="form-section-label">Select your account</div>
              <div className="identity-user-list">
                {users.map(u => (
                  <button
                    key={u.id}
                    className={`identity-user-btn${currentIdentity?.type === 'user' && currentIdentity.id === u.id ? ' selected' : ''}`}
                    onClick={() => onSelectUser(u)}
                  >
                    👤 {u.name}
                  </button>
                ))}
              </div>
              <div className="form-divider" />
            </>
          )}

          <div className="form-section-label">Or enter your name</div>
          <div className="form-url-row">
            <div className="form-group">
              <input
                type="text"
                className="form-input"
                placeholder="Your name…"
                value={anonInput}
                onChange={e => onAnonInputChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onSelectAnon() }}
                autoFocus
              />
            </div>
            <button className="btn-fetch" onClick={onSelectAnon} disabled={!anonInput.trim()}>
              Continue
            </button>
          </div>
        </div>
        <div className="modal-footer" style={{ padding: '0 24px 24px' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
