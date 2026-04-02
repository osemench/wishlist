import express from 'express';
import cors from 'cors';
import db from './db.js';
import { scrapeUrl } from './scraper.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// ─── Users ───────────────────────────────────────────────────────────────────

// GET /api/users — list all users
app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY name').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wishlists ────────────────────────────────────────────────────────────────

// GET /api/users/:userId/wishlists — get all wishlists for a user with item count
app.get('/api/users/:userId/wishlists', (req, res) => {
  try {
    const { userId } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
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

// POST /api/users/:userId/wishlists — create a wishlist
app.post('/api/users/:userId/wishlists', (req, res) => {
  try {
    const { userId } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Wishlist name is required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = db.prepare(
      `INSERT INTO wishlists (user_id, name, description, created_at) VALUES (?, ?, ?, datetime('now'))`
    ).run(userId, name.trim(), description?.trim() || null);

    const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(wishlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wishlists/:id — get a single wishlist with all its items
app.get('/api/wishlists/:id', (req, res) => {
  try {
    const { id } = req.params;

    const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(id);
    if (!wishlist) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }

    const items = db.prepare(
      'SELECT * FROM items WHERE wishlist_id = ? ORDER BY created_at DESC'
    ).all(id);

    res.json({ ...wishlist, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Items ────────────────────────────────────────────────────────────────────

// POST /api/wishlists/:wishlistId/items — add item to wishlist
app.post('/api/wishlists/:wishlistId/items', (req, res) => {
  try {
    const { wishlistId } = req.params;
    const { name, description, price, image_url, purchase_url } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(wishlistId);
    if (!wishlist) {
      return res.status(404).json({ error: 'Wishlist not found' });
    }

    const parsedPrice = price != null ? parseFloat(price) : null;

    const result = db.prepare(`
      INSERT INTO items (wishlist_id, name, description, price, image_url, purchase_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      wishlistId,
      name.trim(),
      description?.trim() || null,
      isNaN(parsedPrice) ? null : parsedPrice,
      image_url?.trim() || null,
      purchase_url?.trim() || null
    );

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/items/:id — delete an item
app.delete('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.json({ success: true, id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Scraper ──────────────────────────────────────────────────────────────────

// POST /api/scrape — scrape a URL for product data
app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Basic URL validation
    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'URL must use http or https protocol' });
    }

    const data = await scrapeUrl(url.trim());
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Wishlist server running on http://localhost:${PORT}`);
});
