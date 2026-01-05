/**
 * Waitrose scraper using Claude in Chrome MCP tools
 * This integrates with the existing Chrome automation tools
 */

import { insertOrder, insertOrderItems } from './database.js';

// These are the MCP tool functions (will be passed in from CLI)
let chromeTools = null;

/**
 * Initialize the scraper with Chrome MCP tools
 */
export function initializeScraper(tools) {
  chromeTools = tools;
}

/**
 * Scrape Waitrose orders using Claude in Chrome
 */
export async function scrapeWaitroseOrders(db, options = {}) {
  const { maxOrders = 50, onProgress = null } = options;

  if (!chromeTools) {
    throw new Error('Chrome tools not initialized. This feature requires Claude in Chrome.');
  }

  console.log('\n🌐 Starting Waitrose order scraper...\n');

  let tabId = null;

  try {
    // Step 1: Get or create Chrome tab context
    if (onProgress) onProgress({ step: 'init', message: 'Initializing Chrome...' });

    const context = await chromeTools.tabs_context_mcp({ createIfEmpty: true });
    const tabs = context.tabs || [];

    if (tabs.length === 0) {
      // Create new tab
      const newTab = await chromeTools.tabs_create_mcp({});
      tabId = newTab.tabId;
    } else {
      // Use existing tab
      tabId = tabs[0].id;
    }

    console.log(`✅ Using Chrome tab ${tabId}\n`);

    // Step 2: Navigate to Waitrose order history
    if (onProgress) onProgress({ step: 'navigate', message: 'Navigating to Waitrose...' });

    await chromeTools.navigate({
      tabId,
      url: 'https://www.waitrose.com/ecom/my-account/order-history'
    });

    console.log('📍 Navigated to Waitrose order history page');
    console.log('⏳ Waiting for page to load...\n');

    await sleep(3000); // Give page time to load

    // Step 3: Check if login is required
    const pageSnapshot = await chromeTools.read_page({ tabId });
    const pageText = pageSnapshot.text || '';

    if (pageText.toLowerCase().includes('sign in') || pageText.toLowerCase().includes('log in')) {
      console.log('🔐 Login required!\n');
      console.log('Please log in to Waitrose in the browser window.');
      console.log('Press Enter when you have logged in and see your order history...');

      // Wait for user input
      await waitForEnter();

      // Re-read page after login
      const loggedInPage = await chromeTools.read_page({ tabId });
      console.log('✅ Login confirmed\n');
    }

    // Step 4: Extract order data from the page
    if (onProgress) onProgress({ step: 'extract', message: 'Extracting orders...' });

    console.log('🔍 Analyzing order history page...\n');

    const orders = await extractOrdersFromPage(tabId, maxOrders, onProgress);

    console.log(`\n✅ Found ${orders.length} orders\n`);

    // Step 5: Save to database
    if (onProgress) onProgress({ step: 'save', message: 'Saving to database...' });

    const result = await saveOrdersToDatabase(db, orders, onProgress);

    console.log(`\n📊 Results:`);
    console.log(`   Saved: ${result.savedCount} orders`);
    console.log(`   Skipped: ${result.skippedCount} orders`);
    console.log(`   Total items: ${result.totalItems}\n`);

    return result;

  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    throw error;
  }
}

/**
 * Extract orders from the Waitrose order history page
 */
async function extractOrdersFromPage(tabId, maxOrders, onProgress) {
  const orders = [];

  try {
    // Get page content
    const pageText = await chromeTools.get_page_text({ tabId });

    // Try to find order elements using the find tool
    const orderElements = await chromeTools.find({
      tabId,
      query: 'order history items or order cards'
    });

    console.log(`Found ${orderElements.length} potential order elements\n`);

    // For now, we'll parse the page text to extract order data
    // This is a simplified version - real implementation would use the accessibility tree
    const parsedOrders = parseOrdersFromText(pageText);

    return parsedOrders.slice(0, maxOrders);

  } catch (error) {
    console.error('Error extracting orders:', error.message);
    return [];
  }
}

/**
 * Parse orders from page text
 * This is a placeholder - real implementation would use DOM structure
 */
function parseOrdersFromText(pageText) {
  // TODO: Implement actual parsing logic based on Waitrose HTML structure
  // For now, return empty array
  console.log('⚠️  Order parsing not yet implemented');
  console.log('This would analyze the page structure to extract:');
  console.log('  - Order numbers');
  console.log('  - Order dates');
  console.log('  - Item names and quantities\n');

  return [];
}

/**
 * Save orders to database
 */
async function saveOrdersToDatabase(db, orders, onProgress) {
  let savedCount = 0;
  let skippedCount = 0;
  let totalItems = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];

    try {
      // Insert order
      const orderId = insertOrder(db, {
        order_number: order.order_number,
        order_date: order.order_date
      });

      // Insert items
      insertOrderItems(db, orderId, order.items);

      totalItems += order.items.length;
      savedCount++;

      if (onProgress) {
        onProgress({
          step: 'save',
          current: i + 1,
          total: orders.length,
          message: `Saving order ${i + 1}/${orders.length}`
        });
      }
    } catch (error) {
      console.warn(`⚠️  Failed to save order ${order.order_number}:`, error.message);
      skippedCount++;
    }
  }

  return { savedCount, skippedCount, totalItems };
}

/**
 * Helper: Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper: Wait for user to press Enter
 */
function waitForEnter() {
  return new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('', () => {
      readline.close();
      resolve();
    });
  });
}
