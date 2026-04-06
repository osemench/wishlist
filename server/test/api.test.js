import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

// The in-memory DB is seeded with:
//   users:     Alice (id 1), Bob (id 2)
//   wishlists: Birthday (id 1, alice), Home Office (id 2, alice), Gaming (id 3, bob)
//   items:     ids 1-13 spread across those wishlists

// ─── Config ───────────────────────────────────────────────────────────────────

describe('GET /api/config', () => {
  test('returns testMode and providers', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('testMode');
    expect(res.body).toHaveProperty('providers');
  });
});

// ─── Users ────────────────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  test('returns seeded users without password_hash', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).not.toHaveProperty('password_hash');
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('name');
    expect(res.body[0]).toHaveProperty('email');
  });
});

// ─── Wishlists ────────────────────────────────────────────────────────────────

describe('wishlists', () => {
  test('GET /api/users/1/wishlists returns Alice\'s lists with item_count', async () => {
    const res = await request(app).get('/api/users/1/wishlists');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0]).toHaveProperty('item_count');
  });

  test('GET /api/users/999/wishlists returns 404', async () => {
    const res = await request(app).get('/api/users/999/wishlists');
    expect(res.status).toBe(404);
  });

  test('POST creates a wishlist with name and emoji', async () => {
    const res = await request(app)
      .post('/api/users/1/wishlists')
      .send({ name: 'Test List', description: 'A test', emoji: '🧪' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test List');
    expect(res.body.emoji).toBe('🧪');
    expect(res.body.id).toBeTruthy();
  });

  test('POST returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/users/1/wishlists')
      .send({ description: 'No name' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test('GET /api/wishlists/:id returns wishlist with items and is_purchased', async () => {
    const res = await request(app).get('/api/wishlists/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0]).toHaveProperty('is_purchased');
    // image_data blob must not be included
    expect(res.body.items[0]).not.toHaveProperty('image_data');
  });

  test('GET /api/wishlists/999 returns 404', async () => {
    const res = await request(app).get('/api/wishlists/999');
    expect(res.status).toBe(404);
  });
});

// ─── Items ────────────────────────────────────────────────────────────────────

describe('items', () => {
  let wishlistId;
  let itemId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/users/2/wishlists')
      .send({ name: 'Item Test Wishlist' });
    wishlistId = res.body.id;
  });

  test('POST creates an item', async () => {
    const res = await request(app)
      .post(`/api/wishlists/${wishlistId}/items`)
      .send({ name: 'Test Item', price: 9.99, purchase_url: 'https://example.com' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Item');
    expect(res.body.price).toBe(9.99);
    expect(res.body.is_purchased).toBe(0);
    itemId = res.body.id;
  });

  test('POST returns 400 when name is missing', async () => {
    const res = await request(app)
      .post(`/api/wishlists/${wishlistId}/items`)
      .send({ price: 5 });
    expect(res.status).toBe(400);
  });

  test('DELETE removes item and returns its id', async () => {
    const res = await request(app).delete(`/api/items/${itemId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBe(itemId);
  });

  test('DELETE returns 404 for unknown item', async () => {
    const res = await request(app).delete('/api/items/999999');
    expect(res.status).toBe(404);
  });
});

// ─── Sharing ──────────────────────────────────────────────────────────────────

describe('sharing', () => {
  let shareToken;

  test('POST /api/wishlists/1/share returns a token', async () => {
    const res = await request(app).post('/api/wishlists/1/share');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    shareToken = res.body.token;
  });

  test('POST again returns the same token (idempotent)', async () => {
    const res = await request(app).post('/api/wishlists/1/share');
    expect(res.body.token).toBe(shareToken);
  });

  test('GET /api/share/:token returns wishlist with items', async () => {
    const res = await request(app).get(`/api/share/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0]).toHaveProperty('my_purchase_id');
  });

  test('GET /api/share/invalid returns 404', async () => {
    const res = await request(app).get('/api/share/doesnotexist');
    expect(res.status).toBe(404);
  });

  test('viewer_user_id is reflected in my_purchase_id', async () => {
    // no purchase yet → null
    const res = await request(app)
      .get(`/api/share/${shareToken}?viewer_user_id=1`);
    expect(res.body.items.every(i => i.my_purchase_id === null)).toBe(true);
  });
});

// ─── Purchases ────────────────────────────────────────────────────────────────

describe('purchases', () => {
  let purchaseId;
  // Use item 1 (from Alice's birthday list — seeded)
  const ITEM_ID = 1;

  test('POST marks item as purchased by named user', async () => {
    const res = await request(app)
      .post(`/api/items/${ITEM_ID}/purchase`)
      .send({ anon_name: 'Tester' });
    expect(res.status).toBe(201);
    expect(res.body.anon_name).toBe('Tester');
    purchaseId = res.body.id;
  });

  test('POST is idempotent — returns existing purchase', async () => {
    const res = await request(app)
      .post(`/api/items/${ITEM_ID}/purchase`)
      .send({ anon_name: 'Tester' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(purchaseId);
  });

  test('item is now is_purchased=1 in wishlist response', async () => {
    const res = await request(app).get('/api/wishlists/1');
    const item = res.body.items.find(i => i.id === ITEM_ID);
    expect(item.is_purchased).toBe(1);
  });

  test('GET /api/wishlists/1/purchases lists the purchase with purchaser_name', async () => {
    const res = await request(app).get('/api/wishlists/1/purchases');
    expect(res.status).toBe(200);
    const entry = res.body.find(p => p.id === purchaseId);
    expect(entry.purchaser_name).toBe('Tester');
  });

  test('DELETE by wrong anon_name returns 403', async () => {
    const res = await request(app)
      .delete(`/api/purchases/${purchaseId}`)
      .send({ anon_name: 'SomeoneElse' });
    expect(res.status).toBe(403);
  });

  test('DELETE by correct anon_name removes the purchase', async () => {
    const res = await request(app)
      .delete(`/api/purchases/${purchaseId}`)
      .send({ anon_name: 'Tester' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('POST returns 400 when no identity provided', async () => {
    const res = await request(app)
      .post(`/api/items/${ITEM_ID}/purchase`)
      .send({});
    expect(res.status).toBe(400);
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('auth', () => {
  const EMAIL = `test-${Date.now()}@example.com`;
  let authToken;

  test('POST /api/auth/register creates account and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: EMAIL, password: 'password123' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe(EMAIL);
    expect(res.body.user).not.toHaveProperty('password_hash');
    authToken = res.body.token;
  });

  test('POST /api/auth/register rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dupe', email: EMAIL, password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/register rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Short', email: 'short@example.com', password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 character/i);
  });

  test('POST /api/auth/login returns token for correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'password123' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  test('POST /api/auth/login rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('POST /api/auth/login rejects unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me returns user for valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(EMAIL);
  });

  test('GET /api/auth/me returns 401 for invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me returns 401 with no header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
