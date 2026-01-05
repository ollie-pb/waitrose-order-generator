/**
 * Waitrose order scraper using Claude in Chrome MCP tools
 * This module uses Claude's browser automation to navigate and extract order history
 */

import { insertOrder, insertOrderItems } from './database.js';

/**
 * Scrape Waitrose order history using Claude in Chrome
 *
 * This is a placeholder for the actual implementation using MCP tools.
 * The actual scraping will be done interactively with the user present.
 *
 * @param {Object} db - Database connection
 * @param {Object} options - Scraping options
 * @returns {Object} Scraping results
 */
export async function scrapeWaitroseOrders(db, options = {}) {
  const { maxOrders = 50, onProgress = null } = options;

  console.log('\n🌐 Starting Waitrose order scraper...\n');
  console.log('This will open Chrome and navigate to Waitrose.com.');
  console.log('You\'ll need to log in manually if not already logged in.\n');

  // Instructions for manual execution
  console.log('📋 Instructions for using this scraper:\n');
  console.log('1. The scraper will open a Chrome browser window');
  console.log('2. Navigate to https://www.waitrose.com/ecom/my-account/order-history');
  console.log('3. Log in if prompted (handles 2FA automatically)');
  console.log('4. Claude will analyze the page and extract order data');
  console.log('5. Orders will be saved to your local database\n');

  // TODO: Implement actual Claude in Chrome integration
  // For now, provide instructions for manual testing

  throw new Error(
    'Claude in Chrome integration not yet implemented.\n\n' +
    'To test the app:\n' +
    '1. Use the mock data already in the database (from test-db.js)\n' +
    '2. Run: node cli.js generate\n\n' +
    'Or wait for Phase 3b implementation which will use Claude in Chrome MCP tools.'
  );
}

/**
 * Parse order data from extracted text
 * Converts raw text/HTML into structured order objects
 */
export function parseOrderData(rawData) {
  // TODO: Implement parsing logic
  // This will extract:
  // - Order number
  // - Order date
  // - Item names
  // - Quantities

  return {
    orders: [],
    itemCount: 0
  };
}

/**
 * Validate order data before inserting into database
 */
export function validateOrderData(orderData) {
  if (!orderData.order_number || !orderData.order_date) {
    return { valid: false, error: 'Missing order number or date' };
  }

  if (!orderData.items || orderData.items.length === 0) {
    return { valid: false, error: 'No items in order' };
  }

  for (const item of orderData.items) {
    if (!item.product_name || !item.quantity) {
      return { valid: false, error: 'Invalid item data' };
    }
  }

  return { valid: true };
}

/**
 * Save scraped orders to database
 */
export async function saveScrapedOrders(db, orders, onProgress = null) {
  let savedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];

    // Validate order data
    const validation = validateOrderData(order);
    if (!validation.valid) {
      console.warn(`⚠️  Skipping invalid order ${order.order_number}: ${validation.error}`);
      skippedCount++;
      continue;
    }

    try {
      // Insert order
      const orderId = insertOrder(db, {
        order_number: order.order_number,
        order_date: order.order_date
      });

      // If order already existed, orderId will be the existing ID
      // Insert items
      insertOrderItems(db, orderId, order.items);
      savedCount++;

      if (onProgress) {
        onProgress({ current: i + 1, total: orders.length, savedCount, skippedCount });
      }
    } catch (error) {
      console.error(`❌ Error saving order ${order.order_number}:`, error.message);
      skippedCount++;
    }
  }

  return { savedCount, skippedCount };
}
