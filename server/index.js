import express from 'express';
import cors from 'cors';
import { randomBytes } from 'crypto';
import axios from 'axios';
import sharp from 'sharp';
import db from './db.js';
import { scrapeUrl } from './scraper.js';

const app = express();
const PORT = 3001;
const MAX_IMAGE_DIMENSION = 600;

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

// ─── Users ───────────────────────────────────────────────────────────────────

app.get('/api/users', (_req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM users ORDER BY name').all());
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
    const result = db.prepare(
      `INSERT INTO wishlists (user_id, name, description, created_at) VALUES (?, ?, ?, datetime('now'))`
    ).run(userId, name.trim(), description?.trim() || null);
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

app.listen(PORT, () => console.log(`Wishlist server running on http://localhost:${PORT}`));
