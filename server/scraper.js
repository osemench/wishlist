import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Collects candidate images from a parsed page, scored by size and squareness.
 * Returns up to 8 candidates sorted best-first.
 */
function collectCandidateImages($, pageUrl) {
  const makeAbsolute = (src) => {
    if (!src || typeof src !== 'string') return null;
    try {
      return new URL(src.trim(), pageUrl).href;
    } catch {
      return null;
    }
  };

  // map of url -> {url, width, height, score}
  const candidates = new Map();

  const addCandidate = (src, widthStr, heightStr, basePriority) => {
    if (!src) return;
    const absUrl = makeAbsolute(src);
    if (!absUrl || !/^https?:\/\//.test(absUrl)) return;

    const width = parseInt(widthStr) || null;
    const height = parseInt(heightStr) || null;

    let score;
    if (width && height && width >= 100 && height >= 100) {
      // Score by squareness (1 = perfect square) * normalized log size
      const squareness = Math.min(width, height) / Math.max(width, height);
      const logSize = Math.log10(width * height) / 6; // 1000x1000 = 1.0
      score = squareness * 100 * Math.min(logSize, 1.5);
    } else {
      score = basePriority;
    }

    if (!candidates.has(absUrl) || candidates.get(absUrl).score < score) {
      candidates.set(absUrl, { url: absUrl, width, height, score });
    }
  };

  // og:image (highest priority meta source)
  const ogImageUrl = $('meta[property="og:image"]').attr('content') ||
                     $('meta[property="og:image:url"]').attr('content');
  const ogWidth = $('meta[property="og:image:width"]').attr('content');
  const ogHeight = $('meta[property="og:image:height"]').attr('content');
  addCandidate(ogImageUrl, ogWidth, ogHeight, 85);

  // og:image:secure_url (sometimes different from og:image)
  const ogSecureUrl = $('meta[property="og:image:secure_url"]').attr('content');
  if (ogSecureUrl && ogSecureUrl !== ogImageUrl) {
    addCandidate(ogSecureUrl, ogWidth, ogHeight, 80);
  }

  // twitter:image
  const twitterImage = $('meta[name="twitter:image"]').attr('content') ||
                       $('meta[property="twitter:image"]').attr('content') ||
                       $('meta[name="twitter:image:src"]').attr('content');
  addCandidate(twitterImage, null, null, 70);

  // link[rel=image_src]
  addCandidate($('link[rel="image_src"]').attr('href'), null, null, 65);

  // <img> tags — look for large or product-like images
  $('img').each((_, el) => {
    const src = $(el).attr('src') ||
                $(el).attr('data-src') ||
                $(el).attr('data-lazy-src') ||
                $(el).attr('data-original');
    if (!src) return;

    const width = $(el).attr('width');
    const height = $(el).attr('height');
    const w = parseInt(width) || 0;
    const h = parseInt(height) || 0;
    const className = ($(el).attr('class') || '').toLowerCase();
    const id = ($(el).attr('id') || '').toLowerCase();
    const alt = ($(el).attr('alt') || '').toLowerCase();
    const srcLower = src.toLowerCase();

    const isLarge = w >= 200 && h >= 200;
    const isProductLike = /product|hero|main|primary|zoom|large|full|detail|gallery|feature/
      .test(srcLower + className + id + alt);

    if (isLarge || isProductLike) {
      addCandidate(src, width, height, isLarge ? 55 : 35);
    }
  });

  return Array.from(candidates.values())
    .filter(c => c.url)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

/**
 * Scrapes a URL and extracts product information.
 * @param {string} url - The URL to scrape
 * @returns {Promise<{name, description, price, image_url, purchase_url, candidate_images}>}
 */
export async function scrapeUrl(url) {
  let response;

  try {
    response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000,
      maxRedirects: 5,
    });
  } catch (err) {
    if (err.response) {
      throw new Error(`Failed to fetch URL: HTTP ${err.response.status} ${err.response.statusText}`);
    } else if (err.code === 'ECONNABORTED') {
      throw new Error('Failed to fetch URL: Request timed out after 10 seconds');
    } else if (err.code === 'ENOTFOUND') {
      throw new Error(`Failed to fetch URL: Could not resolve host for "${url}"`);
    } else {
      throw new Error(`Failed to fetch URL: ${err.message}`);
    }
  }

  const $ = cheerio.load(response.data);

  // Extract name
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const titleTag = $('title').text().trim();
  const name = (ogTitle || titleTag || '').trim();

  // Extract description
  const ogDescription = $('meta[property="og:description"]').attr('content');
  const metaDescription = $('meta[name="description"]').attr('content');
  const description = (ogDescription || metaDescription || '').trim();

  // Collect candidate images
  const candidate_images = collectCandidateImages($, url);
  const image_url = candidate_images.length > 0 ? candidate_images[0].url : '';

  // Extract price
  let price = null;

  const ogPrice = $('meta[property="og:price:amount"]').attr('content') ||
                  $('meta[property="product:price:amount"]').attr('content');
  if (ogPrice) {
    const parsed = parseFloat(ogPrice.replace(/,/g, ''));
    if (!isNaN(parsed)) price = parsed;
  }

  if (price === null) {
    const schemaPrice = $('[itemprop="price"]').attr('content') ||
                        $('[itemprop="price"]').text().trim();
    if (schemaPrice) {
      const parsed = parseFloat(schemaPrice.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) price = parsed;
    }
  }

  if (price === null) {
    const priceRegex = /\$[\d,]+\.?\d*/g;
    const bodyText = $('body').text();
    const matches = bodyText.match(priceRegex);
    if (matches && matches.length > 0) {
      for (const match of matches) {
        const parsed = parseFloat(match.replace(/[$,]/g, ''));
        if (!isNaN(parsed) && parsed > 0 && parsed < 100000) {
          price = parsed;
          break;
        }
      }
    }
  }

  return {
    name,
    description,
    price,
    image_url,
    candidate_images,
    purchase_url: url,
  };
}
