import { describe, test, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { parsePageData } from '../scraper.js';

const BASE_URL = 'https://example.com/product';

function parse(html) {
  return parsePageData(cheerio.load(html), BASE_URL);
}

// ─── Name extraction ──────────────────────────────────────────────────────────

describe('name extraction', () => {
  test('uses og:title when present', () => {
    const { name } = parse('<meta property="og:title" content="Great Widget">');
    expect(name).toBe('Great Widget');
  });

  test('falls back to <title> tag', () => {
    const { name } = parse('<title>Fallback Title</title>');
    expect(name).toBe('Fallback Title');
  });

  test('og:title takes priority over <title>', () => {
    const { name } = parse(`
      <title>Page Title</title>
      <meta property="og:title" content="OG Title">
    `);
    expect(name).toBe('OG Title');
  });

  test('returns empty string when nothing found', () => {
    const { name } = parse('<div>no title here</div>');
    expect(name).toBe('');
  });
});

// ─── Description extraction ───────────────────────────────────────────────────

describe('description extraction', () => {
  test('uses og:description', () => {
    const { description } = parse('<meta property="og:description" content="Nice product">');
    expect(description).toBe('Nice product');
  });

  test('falls back to meta[name=description]', () => {
    const { description } = parse('<meta name="description" content="Meta desc">');
    expect(description).toBe('Meta desc');
  });
});

// ─── Price extraction ─────────────────────────────────────────────────────────

describe('price extraction', () => {
  test('reads og:price:amount', () => {
    const { price } = parse('<meta property="og:price:amount" content="49.99">');
    expect(price).toBe(49.99);
  });

  test('reads product:price:amount', () => {
    const { price } = parse('<meta property="product:price:amount" content="29.00">');
    expect(price).toBe(29);
  });

  test('handles comma-formatted og:price', () => {
    const { price } = parse('<meta property="og:price:amount" content="1,299.00">');
    expect(price).toBe(1299);
  });

  test('reads itemprop=price content attribute', () => {
    const { price } = parse('<span itemprop="price" content="19.95">$19.95</span>');
    expect(price).toBe(19.95);
  });

  test('reads itemprop=price text content', () => {
    const { price } = parse('<span itemprop="price">$24.99</span>');
    expect(price).toBe(24.99);
  });

  test('falls back to dollar-amount regex scan', () => {
    const { price } = parse('<body><p>Regular price: $12.50</p></body>');
    expect(price).toBe(12.5);
  });

  test('skips prices over $100,000', () => {
    const { price } = parse('<body><p>Value: $200,000</p></body>');
    expect(price).toBeNull();
  });

  test('og:price takes priority over body text', () => {
    const { price } = parse(`
      <meta property="og:price:amount" content="99.00">
      <body>$1.00 sale!</body>
    `);
    expect(price).toBe(99);
  });
});

// ─── Image candidates ─────────────────────────────────────────────────────────

describe('image candidates', () => {
  test('picks up og:image', () => {
    const { candidate_images } = parse(
      '<meta property="og:image" content="https://example.com/img.jpg">'
    );
    expect(candidate_images[0].url).toBe('https://example.com/img.jpg');
  });

  test('converts relative og:image to absolute', () => {
    const { candidate_images } = parse(
      '<meta property="og:image" content="/images/product.jpg">'
    );
    expect(candidate_images[0].url).toBe('https://example.com/images/product.jpg');
  });

  test('og:image has higher base score than an unsized img tag', () => {
    const { candidate_images } = parse(`
      <meta property="og:image" content="https://example.com/og.jpg">
      <img src="https://example.com/product-hero.jpg" class="product-hero">
    `);
    const ogEntry = candidate_images.find(c => c.url.includes('og.jpg'));
    const imgEntry = candidate_images.find(c => c.url.includes('product-hero'));
    expect(ogEntry.score).toBeGreaterThan(imgEntry.score);
  });

  test('large square img beats og:image base score', () => {
    const { candidate_images } = parse(`
      <meta property="og:image" content="https://example.com/og.jpg">
      <img src="https://example.com/big.jpg" width="1000" height="1000">
    `);
    const bigEntry = candidate_images.find(c => c.url.includes('big.jpg'));
    const ogEntry  = candidate_images.find(c => c.url.includes('og.jpg'));
    expect(bigEntry.score).toBeGreaterThan(ogEntry.score);
  });

  test('filters out non-http URLs', () => {
    const { candidate_images } = parse(
      '<img src="data:image/png;base64,abc" width="500" height="500">'
    );
    expect(candidate_images.every(c => c.url.startsWith('http'))).toBe(true);
  });

  test('deduplicates the same URL from multiple sources', () => {
    const { candidate_images } = parse(`
      <meta property="og:image" content="https://example.com/same.jpg">
      <meta property="og:image:secure_url" content="https://example.com/same.jpg">
    `);
    const matches = candidate_images.filter(c => c.url === 'https://example.com/same.jpg');
    expect(matches).toHaveLength(1);
  });

  test('returns at most 8 candidates', () => {
    const imgs = Array.from({ length: 15 }, (_, i) =>
      `<img src="https://example.com/product-img-${i}.jpg" width="300" height="300">`
    ).join('');
    const { candidate_images } = parse(imgs);
    expect(candidate_images.length).toBeLessThanOrEqual(8);
  });

  test('wider-than-tall image scores lower than square of same area', () => {
    const { candidate_images } = parse(`
      <img src="https://example.com/square.jpg"  width="600" height="600">
      <img src="https://example.com/wide.jpg"    width="900" height="300">
    `);
    const sq   = candidate_images.find(c => c.url.includes('square'));
    const wide = candidate_images.find(c => c.url.includes('wide'));
    expect(sq.score).toBeGreaterThan(wide.score);
  });
});
