import { useState } from 'react'

export default function NewWishlistModal({ userId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Wishlist name is required.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/users/${userId}/wishlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onCreated(data)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-wishlist-title">
        <div className="modal-header">
          <h2 className="modal-title" id="new-wishlist-title">New Wishlist</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={handleSubmit} id="new-wishlist-form">
            <div className="form-group">
              <label className="form-label" htmlFor="wl-name">
                Name <span>(required)</span>
              </label>
              <input
                id="wl-name"
                type="text"
                className="form-input"
                placeholder="e.g. Birthday Wishlist"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="wl-description">
                Description <span>(optional)</span>
              </label>
              <textarea
                id="wl-description"
                className="form-textarea"
                placeholder="What is this wishlist for?"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </form>
        </div>

        <div className="modal-footer" style={{ padding: '0 24px 24px' }}>
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn-primary"
            form="new-wishlist-form"
            type="submit"
            disabled={submitting || !name.trim()}
          >
            {submitting ? <><span className="spinner"></span> Creating…</> : 'Create Wishlist'}
          </button>
        </div>
      </div>
    </div>
  )
}
