import express from 'express';
import cors from 'cors';
import axios from 'axios';
import sharp from 'sharp';
import db from './db.js';
import { scrapeUrl } from './scraper.js';

const app = express();
const PORT = 3001;
const MAX_IMAGE_DIMENSION = 600; // px on longest side

// Columns returned for items — excludes the binary image_data blob
const ITEM_COLS = 'id, wishlist_id, name, description, price, image_url, purchase_url, created_at';

app.use(cors());
app.use(express.json());

// ─── Image helpers ────────────────────────────────────────────────────────────

/**
 * Downloads an external image URL, scales it to MAX_IMAGE_DIMENSION on the
 * longest side, and returns a JPEG Buffer ready for DB storage.
 */
async function downloadImage(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    maxContentLength: 20 * 1024 * 1024,
  });

  const buffer = await sharp(Buffer.from(response.data))
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();

  return buffer;
}

// ─── Users ───────────────────────────────────────────────────────────────────

app.get('/api/users', (_req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY name').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wishlists ────────────────────────────────────────────────────────────────

app.get('/api/users/:userId/wishlists', (req, res) => {
  try {
    const { userId } = req.params;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

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

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Wishlist name is required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = db.prepare(
      `INSERT INTO wishlists (user_id, name, description, created_at) VALUES (?, ?, ?, datetime('now'))`
    ).run(userId, name.trim(), description?.trim() || null);

    const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(wishlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wishlists/:id', (req, res) => {
  try {
    const { id } = req.params;

    const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(id);
    if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' });

    const items = db.prepare(
      `SELECT ${ITEM_COLS} FROM items WHERE wishlist_id = ? ORDER BY created_at DESC`
    ).all(id);

    res.json({ ...wishlist, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Items ────────────────────────────────────────────────────────────────────

// POST /api/wishlists/:wishlistId/items
// Accepts optional `image_source_url`: external image URL to download, resize,
// and store as a JPEG blob in the database.
app.post('/api/wishlists/:wishlistId/items', async (req, res) => {
  try {
    const { wishlistId } = req.params;
    const { name, description, price, image_url, image_source_url, purchase_url } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    const wishlist = db.prepare('SELECT * FROM wishlists WHERE id = ?').get(wishlistId);
    if (!wishlist) return res.status(404).json({ error: 'Wishlist not found' });

    const parsedPrice = price != null ? parseFloat(price) : null;

    // Insert the item first so we have an ID for the image URL
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

    const newId = result.lastInsertRowid;

    // Download, resize, and store the image blob if a source URL was provided
    if (image_source_url?.trim()) {
      try {
        const imageBuffer = await downloadImage(image_source_url.trim());
        db.prepare(
          'UPDATE items SET image_data = ?, image_mime = ?, image_url = ? WHERE id = ?'
        ).run(imageBuffer, 'image/jpeg', `/api/items/${newId}/image`, newId);
      } catch {
        // Leave image_url as-is (null or the manual value) if download fails
      }
    }

    const item = db.prepare(`SELECT ${ITEM_COLS} FROM items WHERE id = ?`).get(newId);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/items/:id/image — stream the stored image blob
app.get('/api/items/:id/image', (req, res) => {
  try {
    const { id } = req.params;
    const row = db.prepare('SELECT image_data, image_mime FROM items WHERE id = ?').get(id);

    if (!row || !row.image_data) return res.status(404).end();

    res.set('Content-Type', row.image_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(row.image_data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/items/:id
app.delete('/api/items/:id', (req, res) => {
  try {
    const { id } = req.params;

    const item = db.prepare('SELECT id FROM items WHERE id = ?').get(id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.json({ success: true, id: parseInt(id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Scraper ──────────────────────────────────────────────────────────────────

app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }

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
