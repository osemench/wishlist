import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, 'wishlist.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wishlist_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL,
    image_url TEXT,
    purchase_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (wishlist_id) REFERENCES wishlists(id) ON DELETE CASCADE
  );
`);

// Migrate: add image columns if they don't exist yet (safe on existing databases)
try { db.exec('ALTER TABLE items ADD COLUMN image_data BLOB'); } catch { /* already exists */ }
try { db.exec('ALTER TABLE items ADD COLUMN image_mime TEXT'); } catch { /* already exists */ }

// Migrate: password_hash on users (for non-test-mode auth)
try { db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT'); } catch { /* already exists */ }

// Migrate: share token on wishlists
try { db.exec('ALTER TABLE wishlists ADD COLUMN share_token TEXT'); } catch { /* already exists */ }

// Purchases table
db.exec(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    user_id INTEGER,
    anon_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

// Seed data only if users table is empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();

if (userCount.count === 0) {
  // Insert users
  const insertUser = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
  const alice = insertUser.run('Alice Smith', 'alice@example.com');
  const bob = insertUser.run('Bob Jones', 'bob@example.com');

  // Insert wishlists
  const insertWishlist = db.prepare(
    "INSERT INTO wishlists (user_id, name, description, created_at) VALUES (?, ?, ?, datetime('now'))"
  );
  const birthdayList = insertWishlist.run(alice.lastInsertRowid, 'Birthday Wishlist', 'Things I would love for my birthday this year!');
  const homeOfficeList = insertWishlist.run(alice.lastInsertRowid, 'Home Office Upgrade', 'Improving my work-from-home setup');
  const gamingList = insertWishlist.run(bob.lastInsertRowid, 'Gaming Setup', 'Building the ultimate gaming battlestation');

  // Insert items
  const insertItem = db.prepare(
    "INSERT INTO items (wishlist_id, name, description, price, image_url, purchase_url, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  );

  // Alice's Birthday Wishlist items
  insertItem.run(
    birthdayList.lastInsertRowid,
    'Sony WH-1000XM5 Headphones',
    'Industry-leading noise canceling wireless headphones with up to 30-hour battery life.',
    349.99,
    'https://placehold.co/300x300/1a1a2e/ffffff?text=Headphones',
    'https://amazon.com/sony-wh1000xm5'
  );
  insertItem.run(
    birthdayList.lastInsertRowid,
    'Kindle Paperwhite',
    'The thinnest, lightest Kindle Paperwhite yet with a flush-front design and 300 ppi glare-free display.',
    139.99,
    'https://placehold.co/300x300/16213e/ffffff?text=Kindle',
    'https://amazon.com/kindle-paperwhite'
  );
  insertItem.run(
    birthdayList.lastInsertRowid,
    'Le Creuset Dutch Oven',
    '5.5-quart enameled cast iron round Dutch oven in Marseille Blue. Perfect for soups, stews, and bread.',
    399.95,
    'https://placehold.co/300x300/0f3460/ffffff?text=Dutch+Oven',
    'https://amazon.com/le-creuset-dutch-oven'
  );
  insertItem.run(
    birthdayList.lastInsertRowid,
    'Instant Pot Duo 7-in-1',
    'Multi-use pressure cooker, slow cooker, rice cooker, steamer, sauté pan, yogurt maker, and warmer.',
    79.95,
    'https://placehold.co/300x300/533483/ffffff?text=Instant+Pot',
    'https://amazon.com/instant-pot-duo'
  );

  // Alice's Home Office Upgrade items
  insertItem.run(
    homeOfficeList.lastInsertRowid,
    'LG 27" 4K UHD Monitor',
    '27-inch IPS display with 4K resolution, HDR10 support, and USB-C connectivity for a stunning workspace.',
    449.99,
    'https://placehold.co/300x300/2d6a4f/ffffff?text=Monitor',
    'https://amazon.com/lg-27uk850-b'
  );
  insertItem.run(
    homeOfficeList.lastInsertRowid,
    'Keychron K2 Mechanical Keyboard',
    'Compact wireless mechanical keyboard with RGB backlight, hot-swappable switches, and Mac/Windows support.',
    89.99,
    'https://placehold.co/300x300/1b4332/ffffff?text=Keyboard',
    'https://amazon.com/keychron-k2'
  );
  insertItem.run(
    homeOfficeList.lastInsertRowid,
    'Ergotron LX Desk Mount',
    'Premium desk monitor arm with easy height, tilt, and rotation adjustments. Holds monitors up to 34 inches.',
    189.99,
    'https://placehold.co/300x300/40916c/ffffff?text=Monitor+Arm',
    'https://amazon.com/ergotron-lx'
  );
  insertItem.run(
    homeOfficeList.lastInsertRowid,
    'Logitech MX Master 3S Mouse',
    'Advanced wireless mouse with ultra-fast MagSpeed scrolling, 8K DPI tracking, and quiet clicks.',
    99.99,
    'https://placehold.co/300x300/52b788/ffffff?text=Mouse',
    'https://amazon.com/logitech-mx-master-3s'
  );

  // Bob's Gaming Setup items
  insertItem.run(
    gamingList.lastInsertRowid,
    'ASUS ROG Swift 27" Gaming Monitor',
    '1440p 165Hz gaming monitor with G-Sync, 1ms response time, and IPS panel for competitive and immersive gaming.',
    549.99,
    'https://placehold.co/300x300/7b2d8b/ffffff?text=Gaming+Monitor',
    'https://amazon.com/asus-rog-swift'
  );
  insertItem.run(
    gamingList.lastInsertRowid,
    'Corsair K95 RGB Platinum Keyboard',
    'Mechanical gaming keyboard with Cherry MX Speed switches, per-key RGB backlighting, and dedicated macro keys.',
    149.99,
    'https://placehold.co/300x300/4a0e8f/ffffff?text=Gaming+Keyboard',
    'https://amazon.com/corsair-k95'
  );
  insertItem.run(
    gamingList.lastInsertRowid,
    'SteelSeries Arctis Nova Pro Headset',
    'Premium gaming headset with active noise cancellation, multi-system connect, and hi-res audio.',
    349.99,
    'https://placehold.co/300x300/6a0dad/ffffff?text=Gaming+Headset',
    'https://amazon.com/steelseries-arctis-nova-pro'
  );
  insertItem.run(
    gamingList.lastInsertRowid,
    'Razer DeathAdder V3 Pro Mouse',
    'Ultra-lightweight wireless gaming mouse with Focus Pro 30K optical sensor and 90-hour battery life.',
    139.99,
    'https://placehold.co/300x300/9b59b6/ffffff?text=Gaming+Mouse',
    'https://amazon.com/razer-deathadder-v3-pro'
  );
  insertItem.run(
    gamingList.lastInsertRowid,
    'NZXT Kraken X63 CPU Cooler',
    '280mm AIO liquid cooler with RGB lighting, 2x140mm fans, and compatibility with all modern CPU sockets.',
    149.99,
    'https://placehold.co/300x300/8e44ad/ffffff?text=CPU+Cooler',
    'https://amazon.com/nzxt-kraken-x63'
  );

  console.log('Database seeded successfully!');
}

export default db;
