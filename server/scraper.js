import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes a URL and extracts product information.
 * @param {string} url - The URL to scrape
 * @returns {Promise<{name: string, description: string, price: number|null, image_url: string, purchase_url: string}>}
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

  // Extract image
  const ogImage = $('meta[property="og:image"]').attr('content');
  let image_url = ogImage || '';
  // Make relative URLs absolute
  if (image_url && image_url.startsWith('/')) {
    try {
      const urlObj = new URL(url);
      image_url = `${urlObj.protocol}//${urlObj.host}${image_url}`;
    } catch {
      // keep as-is
    }
  }

  // Extract price
  let price = null;

  // Try og:price:amount first
  const ogPrice = $('meta[property="og:price:amount"]').attr('content') ||
                  $('meta[property="product:price:amount"]').attr('content');
  if (ogPrice) {
    const parsed = parseFloat(ogPrice.replace(/,/g, ''));
    if (!isNaN(parsed)) price = parsed;
  }

  // Try schema.org price
  if (price === null) {
    const schemaPrice = $('[itemprop="price"]').attr('content') ||
                        $('[itemprop="price"]').text().trim();
    if (schemaPrice) {
      const parsed = parseFloat(schemaPrice.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) price = parsed;
    }
  }

  // Scan text content for dollar amounts
  if (price === null) {
    const priceRegex = /\$[\d,]+\.?\d*/g;
    const bodyText = $('body').text();
    const matches = bodyText.match(priceRegex);
    if (matches && matches.length > 0) {
      // Take the first price found that looks reasonable
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
    purchase_url: url,
  };
}
