import { useState } from 'react'

const emptyForm = {
  name: '',
  description: '',
  price: '',
  image_url: '',
  purchase_url: '',
}

export default function AddItemModal({ wishlistId, onClose, onItemAdded }) {
  const [activeTab, setActiveTab] = useState('manual')
  const [form, setForm] = useState(emptyForm)
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState(null) // { type: 'success'|'error', message }
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleFetch = async () => {
    if (!scrapeUrl.trim()) return
    setScraping(true)
    setScrapeStatus(null)
    setError(null)

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      })
      const data = await res.json()

      if (data.error) throw new Error(data.error)

      setForm({
        name: data.name || '',
        description: data.description || '',
        price: data.price != null ? String(data.price) : '',
        image_url: data.image_url || '',
        purchase_url: data.purchase_url || scrapeUrl.trim(),
      })
      setScrapeStatus({
        type: 'success',
        message: 'Product details fetched! Review and adjust below before saving.',
      })
      setActiveTab('manual')
    } catch (err) {
      setScrapeStatus({ type: 'error', message: err.message })
    } finally {
      setScraping(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Item name is required.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/wishlists/${wishlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          price: form.price !== '' ? parseFloat(form.price) : null,
          image_url: form.image_url.trim() || null,
          purchase_url: form.purchase_url.trim() || null,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onItemAdded(data)
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
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-item-title">
        <div className="modal-header">
          <h2 className="modal-title" id="add-item-title">Add Item</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div className="tabs">
            <button
              className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
              onClick={() => setActiveTab('manual')}
              type="button"
            >
              Manual
            </button>
            <button
              className={`tab-btn ${activeTab === 'url' ? 'active' : ''}`}
              onClick={() => setActiveTab('url')}
              type="button"
            >
              From URL
            </button>
          </div>

          {activeTab === 'url' && (
            <div>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                Paste a product URL and click Fetch to automatically pull in item details.
              </p>
              <div className="form-url-row">
                <div className="form-group">
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://amazon.com/dp/..."
                    value={scrapeUrl}
                    onChange={e => setScrapeUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleFetch() } }}
                    disabled={scraping}
                  />
                </div>
                <button
                  className="btn-fetch"
                  onClick={handleFetch}
                  disabled={scraping || !scrapeUrl.trim()}
                  type="button"
                >
                  {scraping ? <><span className="spinner"></span> Fetching…</> : 'Fetch'}
                </button>
              </div>

              {scrapeStatus && (
                <div className={scrapeStatus.type === 'success' ? 'scrape-success-notice' : 'scrape-error-notice'} style={{ marginTop: 12 }}>
                  <span>{scrapeStatus.type === 'success' ? '✓' : '!'}</span>
                  {scrapeStatus.message}
                </div>
              )}
            </div>
          )}

          {activeTab === 'manual' && (
            <form onSubmit={handleSubmit} id="add-item-form">
              {scrapeStatus?.type === 'success' && (
                <div className="scrape-success-notice">
                  <span>✓</span> {scrapeStatus.message}
                </div>
              )}

              {error && <div className="error-banner">{error}</div>}

              <div className="form-group">
                <label className="form-label" htmlFor="item-name">
                  Name <span>(required)</span>
                </label>
                <input
                  id="item-name"
                  type="text"
                  name="name"
                  className="form-input"
                  placeholder="e.g. Sony WH-1000XM5 Headphones"
                  value={form.name}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="item-description">
                  Description <span>(optional)</span>
                </label>
                <textarea
                  id="item-description"
                  name="description"
                  className="form-textarea"
                  placeholder="A short description of the item…"
                  value={form.description}
                  onChange={handleFormChange}
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="item-price">
                    Price <span>(optional)</span>
                  </label>
                  <input
                    id="item-price"
                    type="number"
                    name="price"
                    className="form-input"
                    placeholder="0.00"
                    value={form.price}
                    onChange={handleFormChange}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="item-purchase-url">
                    Buy Link <span>(optional)</span>
                  </label>
                  <input
                    id="item-purchase-url"
                    type="url"
                    name="purchase_url"
                    className="form-input"
                    placeholder="https://..."
                    value={form.purchase_url}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="item-image-url">
                  Image URL <span>(optional)</span>
                </label>
                <input
                  id="item-image-url"
                  type="url"
                  name="image_url"
                  className="form-input"
                  placeholder="https://..."
                  value={form.image_url}
                  onChange={handleFormChange}
                />
                {form.image_url && (
                  <div style={{ marginTop: 10 }}>
                    <img
                      src={form.image_url}
                      alt="Preview"
                      style={{
                        width: 80,
                        height: 80,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                      }}
                      onError={e => { e.target.style.display = 'none' }}
                    />
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '0 24px 24px' }}>
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          {activeTab === 'manual' && (
            <button
              className="btn-primary"
              form="add-item-form"
              type="submit"
              disabled={submitting || !form.name.trim()}
            >
              {submitting ? <><span className="spinner"></span> Saving…</> : 'Add Item'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
