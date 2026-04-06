import express from 'express';
import cors from 'cors';
import { randomBytes } from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { scrapeUrl } from './scraper.js';

const app = express();
const PORT = 3001;
const MAX_IMAGE_DIMENSION = 600;

// Test mode: on by default. Set TEST_MODE=false in env to enable real auth.
const TEST_MODE = process.env.TEST_MODE !== 'false';
const JWT_SECRET = process.env.JWT_SECRET || 'wishlist-dev-secret-change-in-production';

// Microsoft OAuth — set these env vars to enable the "Sign in with Microsoft" button
const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || '';
const MS_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

// Short-lived CSRF state tokens for OAuth flows: state → expiry ms
const oauthStates = new Map();

// Item columns returned in JSON — excludes the binary image_data blob
const ITEM_COLS = 'i.id, i.wishlist_id, i.name, i.description, i.price, i.image_url, i.purchase_url, i.created_at';

app.use(cors());
app.use(express.json());

// ─── Image helpers ────────────────────────────────────────────────────────────

async function downloadImage(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    maxContentLength: 20 * 1024 * 1024,
  });

  return sharp(Buffer.from(response.data))
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// ─── Config ───────────────────────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({
    testMode: TEST_MODE,
    providers: { microsoft: !!MS_CLIENT_ID },
  });
});

// ─── Auth (non-test-mode only) ────────────────────────────────────────────────

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    ).run(name.trim(), normalizedEmail, passwordHash);

    const user = { id: result.lastInsertRowid, name: name.trim(), email: normalizedEmail };
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (!user?.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — verify a stored token and return the user
app.get('/api/auth/me', (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

    const { userId } = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ─── Microsoft OAuth ──────────────────────────────────────────────────────────

const MS_AUTH_URL  = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MS_GRAPH_URL = 'https://graph.microsoft.com/v1.0/me';

// GET /api/auth/microsoft — redirect the browser to Microsoft's consent screen
app.get('/api/auth/microsoft', (_req, res) => {
  if (!MS_CLIENT_ID) return res.status(503).json({ error: 'Microsoft auth is not configured' });

  const state = randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000); // valid for 10 min

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: MS_REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state,
  });
  res.redirect(`${MS_AUTH_URL}?${params}`);
});

// GET /api/auth/microsoft/callback — Microsoft redirects here with ?code=…
app.get('/api/auth/microsoft/callback', async (req, res) => {
  const { code, state, error: msError } = req.query;
  const fail = (msg) => res.redirect(`${APP_BASE_URL}?auth_error=${encodeURIComponent(msg)}`);

  if (msError) return fail(msError);

  // Validate CSRF state
  const expiry = oauthStates.get(state);
  oauthStates.delete(state);
  if (!expiry || Date.now() > expiry) return fail('Invalid or expired OAuth state — please try again');

  try {
    // Exchange authorisation code for an access token
    const tokenRes = await axios.post(MS_TOKEN_URL,
      new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: MS_REDIRECT_URI,
        scope: 'openid profile email User.Read',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Fetch the user's profile from Microsoft Graph
    const profile = (await axios.get(MS_GRAPH_URL, {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    })).data;

    const msId    = profile.id;
    const msEmail = (profile.mail || profile.userPrincipalName || '').toLowerCase();
    const msName  = profile.displayName || msEmail;

    // Find existing user by OAuth id, or link to a matching email, or create new
    let user = db.prepare(
      'SELECT id, name, email FROM users WHERE oauth_provider = ? AND oauth_id = ?'
    ).get('microsoft', msId);

    if (!user && msEmail) {
      const byEmail = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(msEmail);
      if (byEmail) {
        db.prepare('UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?')
          .run('microsoft', msId, byEmail.id);
        user = byEmail;
      }
    }

    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (name, email, oauth_provider, oauth_id) VALUES (?, ?, ?, ?)'
      ).run(msName, msEmail, 'microsoft', msId);
      user = { id: result.lastInsertRowid, name: msName, email: msEmail };
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.redirect(`${APP_BASE_URL}?auth_token=${encodeURIComponent(token)}`);
  } catch (err) {
    fail(err.response?.data?.error_description || err.message);
  }
});

// ─── Users ───────────────────────────────────────────────────────────────────

// Exclude password_hash from all user list responses
app.get('/api/users', (_req, res) => {
  try {
    res.json(db.prepare('SELECT id, name, email FROM users ORDER BY name').all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wishlists ────────────────────────────────────────────────────────────────

app.get('/api/users/:userId/wishlists', (req, res) => {
  try {
    const { userId } = req.params;
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const wishlists = db.prepare(`
      SELECT w.*, COUNT(i.id) as item_count
      FROM wishlists w
      LEFT JOIN items i ON i.wishlist_id = w.id
      WHERE w.user_id = ?
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `).all(userId);
    res.json(wishlists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/:userId/wishlists', (req, res) => {
  try {
    const { userId } = req.params;
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Wishlist name is required' });
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { emoji } = req.body;
    const result = db.prepare(
      `INSERT INTO wishlists (user_id, name, description, emoji, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(userId, name.trim(), description?.trim() || null, emoji?.trim() || null);
    res.status(201).json(db.prepare('SELECT * FROM wishlists WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wishlists/:id — wishlist with items + purchase counts (owner view)
app.get('/api/wishlists/:id', (req, res) => {
  try {
    const { id } = req.params;
    const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(id);
    if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' });

    const items = db.prepare(`
      SELECT ${ITEM_COLS},
             CASE WHEN COUNT(p.id) > 0 THEN 1 ELSE 0 END AS is_purchased
      FROM items i
      LEFT JOIN purchases p ON p.item_id = i.id
      WHERE i.wishlist_id = ?
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).all(id);

    res.json({ ...wishlist, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Items ────────────────────────────────────────────────────────────────────

app.post('/api/wishlists/:wishlistId/items', async (req, res) => {
  try {
    const { wishlistId } = req.params;
    const { name, description, price, image_url, image_source_url, purchase_url } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Item name is required' });
    if (!db.prepare('SELECT id FROM wishlists WHERE id = ?').get(wishlistId)) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }

    const parsedPrice = price != null ? parseFloat(price) : null;
    const result = db.prepare(`
      INSERT INTO items (wishlist_id, name, description, price, image_url, purchase_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      wishlistId, name.trim(), description?.trim() || null,
      isNaN(parsedPrice) ? null : parsedPrice,
      image_url?.trim() || null, purchase_url?.trim() || null
    );
    const newId = result.lastInsertRowid;

    if (image_source_url?.trim()) {
      try {
        const buf = await downloadImage(image_source_url.trim());
        db.prepare('UPDATE items SET image_data = ?, image_mime = ?, image_url = ? WHERE id = ?')
          .run(buf, 'image/jpeg', `/api/items/${newId}/image`, newId);
      } catch { /* leave image_url as-is on download failure */ }
    }

    // Return the new item (without blob) with is_purchased = 0
    const item = db.prepare(`
      SELECT ${ITEM_COLS}, 0 AS is_purchased FROM items i WHERE i.id = ?
    `).get(newId);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/items/:id/image', (req, res) => {
  try {
    const row = db.prepare('SELECT image_data, image_mime FROM items WHERE id = ?').get(req.params.id);
    if (!row?.image_data) return res.status(404).end();
    res.set('Content-Type', row.image_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(row.image_data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM items WHERE id = ?').get(id)) {
      return res.status(404).json({ error: 'Item not found' });
    }
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.json({ success: true, id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sharing ──────────────────────────────────────────────────────────────────

// POST /api/wishlists/:id/share — generate (or return existing) share token
app.post('/api/wishlists/:id/share', (req, res) => {
  try {
    const { id } = req.params;
    const wishlist = db.prepare('SELECT id, share_token FROM wishlists WHERE id = ?').get(id);
    if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' });

    let token = wishlist.share_token;
    if (!token) {
      token = randomBytes(16).toString('hex');
      db.prepare('UPDATE wishlists SET share_token = ? WHERE id = ?').run(token, id);
    }
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/share/:token — public view of a shared wishlist
// Query params: viewer_user_id (number) | viewer_anon_name (string)
app.get('/api/share/:token', (req, res) => {
  try {
    const { token } = req.params;
    const { viewer_user_id, viewer_anon_name } = req.query;

    const wishlist = db.prepare(
      'SELECT id, name, description FROM wishlists WHERE share_token = ?'
    ).get(token);
    if (!wishlist) return res.status(404).json({ error: 'Wishlist not found or link is invalid' });

    const items = db.prepare(`
      SELECT ${ITEM_COLS},
             CASE WHEN COUNT(p.id) > 0 THEN 1 ELSE 0 END AS is_purchased
      FROM items i
      LEFT JOIN purchases p ON p.item_id = i.id
      WHERE i.wishlist_id = ?
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `).all(wishlist.id);

    // Tag each item with the viewer's own purchase id (if any)
    const itemsTagged = items.map(item => {
      let myPurchaseId = null;
      if (viewer_user_id) {
        const p = db.prepare(
          'SELECT id FROM purchases WHERE item_id = ? AND user_id = ?'
        ).get(item.id, parseInt(viewer_user_id));
        myPurchaseId = p?.id ?? null;
      } else if (viewer_anon_name?.trim()) {
        const p = db.prepare(
          'SELECT id FROM purchases WHERE item_id = ? AND anon_name = ? AND user_id IS NULL'
        ).get(item.id, viewer_anon_name.trim());
        myPurchaseId = p?.id ?? null;
      }
      return { ...item, my_purchase_id: myPurchaseId };
    });

    res.json({ ...wishlist, items: itemsTagged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Purchases ────────────────────────────────────────────────────────────────

// POST /api/items/:itemId/purchase — mark an item as purchased
// Body: { user_id?, anon_name? }
app.post('/api/items/:itemId/purchase', (req, res) => {
  try {
    const { itemId } = req.params;
    const { user_id, anon_name } = req.body;

    if (!user_id && !anon_name?.trim()) {
      return res.status(400).json({ error: 'Provide user_id or anon_name' });
    }
    if (!db.prepare('SELECT id FROM items WHERE id = ?').get(itemId)) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Idempotent — return existing purchase if already marked
    let existing;
    if (user_id) {
      existing = db.prepare(
        'SELECT id FROM purchases WHERE item_id = ? AND user_id = ?'
      ).get(itemId, parseInt(user_id));
    } else {
      existing = db.prepare(
        'SELECT id FROM purchases WHERE item_id = ? AND anon_name = ? AND user_id IS NULL'
      ).get(itemId, anon_name.trim());
    }
    if (existing) return res.status(200).json(db.prepare('SELECT * FROM purchases WHERE id = ?').get(existing.id));

    const result = db.prepare(`
      INSERT INTO purchases (item_id, user_id, anon_name, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(itemId, user_id ? parseInt(user_id) : null, anon_name?.trim() || null);

    res.status(201).json(db.prepare('SELECT * FROM purchases WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/purchases/:purchaseId — unmark a purchase (purchaser only)
// Body: { user_id?, anon_name? }
app.delete('/api/purchases/:purchaseId', (req, res) => {
  try {
    const { purchaseId } = req.params;
    const { user_id, anon_name } = req.body;

    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

    const isOwner =
      (user_id && purchase.user_id === parseInt(user_id)) ||
      (!user_id && anon_name?.trim() && purchase.anon_name === anon_name.trim() && !purchase.user_id);
    if (!isOwner) return res.status(403).json({ error: 'Not authorized' });

    db.prepare('DELETE FROM purchases WHERE id = ?').run(purchaseId);
    res.json({ success: true, id: parseInt(purchaseId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wishlists/:id/purchases — all purchases on a wishlist (for owner)
// Returns purchaser names — only call this if the current user owns the wishlist
app.get('/api/wishlists/:id/purchases', (req, res) => {
  try {
    const { id } = req.params;
    if (!db.prepare('SELECT id FROM wishlists WHERE id = ?').get(id)) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }
    const purchases = db.prepare(`
      SELECT p.id, p.item_id, p.user_id, p.anon_name, p.created_at,
             COALESCE(u.name, p.anon_name, 'Anonymous') AS purchaser_name,
             it.name AS item_name
      FROM purchases p
      LEFT JOIN users u ON u.id = p.user_id
      JOIN items it ON it.id = p.item_id
      WHERE it.wishlist_id = ?
      ORDER BY p.created_at DESC
    `).all(id);
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Scraper ──────────────────────────────────────────────────────────────────

app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url?.trim()) return res.status(400).json({ error: 'URL is required' });

    let parsedUrl;
    try { parsedUrl = new URL(url.trim()); } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'URL must use http or https protocol' });
    }

    res.json(await scrapeUrl(url.trim()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Wishlist server running on http://localhost:${PORT}`));
}
