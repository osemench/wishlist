import { useState } from 'react'

export default function AuthPage({ onAuth, providers = {}, oauthError, onClearOauthError }) {
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const set = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (tab === 'register') {
      if (!form.name.trim()) return setError('Name is required.')
      if (form.password !== form.confirm) return setError('Passwords do not match.')
      if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    }

    setSubmitting(true)
    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register'
      const body = tab === 'login'
        ? { email: form.email.trim(), password: form.password }
        : { name: form.name.trim(), email: form.email.trim(), password: form.password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onAuth(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const displayError = error || oauthError

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span>🎁</span>
          <h1>Wishlist App</h1>
        </div>

        {displayError && (
          <div className="error-banner" style={{ marginBottom: 20 }}>
            {displayError}
            <button onClick={() => { setError(null); onClearOauthError?.() }}
              style={{ marginLeft: 10, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontWeight: 600 }}>
              ×
            </button>
          </div>
        )}

        {providers.microsoft && (
          <>
            <a className="btn-microsoft" href="/api/auth/microsoft">
              <MicrosoftLogo />
              Sign in with Microsoft
            </a>
            <div className="auth-divider"><span>or</span></div>
          </>
        )}

        <div className="tabs" style={{ marginBottom: 24 }}>
          <button className={`tab-btn ${tab === 'login' ? 'active' : ''}`} type="button"
            onClick={() => { setTab('login'); setError(null) }}>
            Sign in
          </button>
          <button className={`tab-btn ${tab === 'register' ? 'active' : ''}`} type="button"
            onClick={() => { setTab('register'); setError(null) }}>
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-name">Name</label>
              <input id="auth-name" type="text" className="form-input" placeholder="Your name"
                value={form.name} onChange={set('name')} autoComplete="name" required />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" className="form-input" placeholder="you@example.com"
              value={form.email} onChange={set('email')} autoComplete="email" required />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" className="form-input"
              placeholder={tab === 'register' ? 'At least 8 characters' : ''}
              value={form.password} onChange={set('password')}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required />
          </div>

          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label" htmlFor="auth-confirm">Confirm password</label>
              <input id="auth-confirm" type="password" className="form-input" placeholder="Repeat password"
                value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={submitting}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            {submitting
              ? <><span className="spinner" />{tab === 'login' ? 'Signing in…' : 'Creating account…'}</>
              : tab === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}

function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}
