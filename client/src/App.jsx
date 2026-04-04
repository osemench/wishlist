import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import WishlistSidebar from './components/WishlistSidebar.jsx'
import WishlistView from './components/WishlistView.jsx'
import ShareView from './components/ShareView.jsx'
import AuthPage from './components/AuthPage.jsx'

// ─── Auth token helpers ───────────────────────────────────────────────────────

function getStoredToken() {
  return localStorage.getItem('auth_token')
}
function storeToken(token) {
  localStorage.setItem('auth_token', token)
}
function clearToken() {
  localStorage.removeItem('auth_token')
}

function authHeaders() {
  const t = getStoredToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // null = not yet loaded, true/false = loaded
  const [testMode, setTestMode] = useState(null)
  // auth-mode identity (non-test only)
  const [authUser, setAuthUser] = useState(null)
  // test-mode user list + selector
  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  // shared wishlist state
  const [wishlists, setWishlists] = useState([])
  const [selectedWishlistId, setSelectedWishlistId] = useState(null)
  const [selectedWishlist, setSelectedWishlist] = useState(null)
  const [loadingWishlists, setLoadingWishlists] = useState(false)
  const [loadingWishlist, setLoadingWishlist] = useState(false)
  const [error, setError] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // 1. Load config to decide whether auth is needed
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        setTestMode(data.testMode)
        if (data.testMode) {
          // Test mode: discard any stale auth token and load all users for the dropdown
          clearToken()
          return fetch('/api/users')
            .then(r => r.json())
            .then(users => {
              if (!users.error) {
                setUsers(users)
                if (users.length > 0) setSelectedUserId(users[0].id)
              }
            })
        } else {
          // Auth mode: try to restore session from localStorage
          const token = getStoredToken()
          if (!token) return // will show AuthPage
          return fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
              if (data.user) {
                setAuthUser(data.user)
                setSelectedUserId(data.user.id)
              } else {
                clearToken() // stale token
              }
            })
        }
      })
      .catch(err => setError(err.message))
  }, [])

  // 2. Load wishlists whenever the active user changes
  useEffect(() => {
    if (!selectedUserId) return
    setLoadingWishlists(true)
    setSelectedWishlistId(null)
    setSelectedWishlist(null)

    fetch(`/api/users/${selectedUserId}/wishlists`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setWishlists(data)
        if (data.length > 0) setSelectedWishlistId(data[0].id)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingWishlists(false))
  }, [selectedUserId])

  // 3. Load selected wishlist with items
  useEffect(() => {
    if (!selectedWishlistId) return
    setLoadingWishlist(true)

    fetch(`/api/wishlists/${selectedWishlistId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setSelectedWishlist(data)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingWishlist(false))
  }, [selectedWishlistId])

  // ─── Auth handlers ──────────────────────────────────────────────────────────

  const handleAuth = ({ token, user }) => {
    storeToken(token)
    setAuthUser(user)
    setSelectedUserId(user.id)
  }

  const handleLogout = () => {
    clearToken()
    setAuthUser(null)
    setSelectedUserId(null)
    setWishlists([])
    setSelectedWishlistId(null)
    setSelectedWishlist(null)
  }

  // ─── Wishlist / item handlers ───────────────────────────────────────────────

  const handleWishlistCreated = (newWishlist) => {
    setWishlists(prev => [{ ...newWishlist, item_count: 0 }, ...prev])
    setSelectedWishlistId(newWishlist.id)
  }

  const handleSelectWishlist = (id) => {
    setSelectedWishlistId(id)
    setSidebarOpen(false)
  }

  const handleItemAdded = (newItem) => {
    setSelectedWishlist(prev => ({
      ...prev,
      items: [newItem, ...(prev.items || [])],
    }))
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
    setWishlists(prev =>
      prev.map(w => w.id === selectedWishlistId
        ? { ...w, item_count: Math.max(0, (w.item_count || 1) - 1) }
        : w
      )
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const currentWishlistName = wishlists.find(w => w.id === selectedWishlistId)?.name

  // Still waiting for /api/config
  if (testMode === null) return null

  // Auth mode + not logged in → show auth screen (but share links always work)
  const needsAuth = !testMode && !authUser

  return (
    <Routes>
      <Route path="/share/:token" element={<ShareView />} />
      <Route path="*" element={
        needsAuth ? <AuthPage onAuth={handleAuth} /> : (
          <div className="app-layout">
            {sidebarOpen && (
              <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
            )}

            <WishlistSidebar
              testMode={testMode}
              authUser={authUser}
              onLogout={handleLogout}
              users={users}
              selectedUserId={selectedUserId}
              onSelectUser={setSelectedUserId}
              wishlists={wishlists}
              selectedWishlistId={selectedWishlistId}
              onSelectWishlist={handleSelectWishlist}
              loadingWishlists={loadingWishlists}
              onWishlistCreated={handleWishlistCreated}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />

            <main className="main-content">
              <div className="mobile-nav">
                <button className="mobile-nav-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                  <span /><span /><span />
                </button>
                <span className="mobile-nav-title">
                  {currentWishlistName || '🎁 Wishlist App'}
                </span>
              </div>

              {error && (
                <div className="error-banner" style={{ margin: '16px 36px 0' }}>
                  {error}
                  <button onClick={() => setError(null)}
                    style={{ marginLeft: 10, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontWeight: 600 }}>
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
      } />
    </Routes>
  )
}
