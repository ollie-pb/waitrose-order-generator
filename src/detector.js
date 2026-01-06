/**
 * Order detection coordinator
 * Checks for new Waitrose orders since last scrape
 */

import chalk from 'chalk';
import { scrapeWaitroseOrders } from './chrome-scraper.js';
import {
  getLastSyncTime,
  updateSyncMetadata,
  filterExistingOrders,
  getOrderCount
} from './database.js';

/**
 * Detect new orders since last scrape
 * @param {Database} db - SQLite database instance
 * @param {Object} chromeTools - Chrome MCP tools (passed from Claude Code context)
 * @param {Object} options - Detection options
 * @returns {Object} Detection summary
 */
export async function detectNewOrders(db, chromeTools, options = {}) {
  const { autoImport = false, maxOrders = 50, onProgress = null } = options;

  console.log('🔍 Starting order detection...\n');

  // Get last sync info
  const lastSync = getLastSyncTime(db);
  const currentOrderCount = getOrderCount(db);

  console.log(`📊 Current database status:`);
  console.log(`   Last sync: ${lastSync.time || 'Never'}`);
  console.log(`   Orders in DB: ${currentOrderCount}\n`);

  try {
    // Use existing scraper to extract orders from Waitrose
    // The scraper handles:
    // - Chrome initialization
    // - Navigation to order history
    // - Login prompts
    // - Order extraction
    const extractedOrders = await extractOrdersOnly(db, chromeTools, maxOrders, onProgress);

    console.log(`\n📋 Found ${extractedOrders.length} orders on page`);

    // Filter to only new orders
    const newOrders = filterExistingOrders(db, extractedOrders);
    const duplicates = extractedOrders.length - newOrders.length;

    console.log(`✨ ${newOrders.length} new orders detected`);
    console.log(`♻️  ${duplicates} already in database\n`);

    // Prepare result
    const result = {
      lastSync: lastSync.time,
      totalExtracted: extractedOrders.length,
      newOrders: newOrders.length,
      newOrderNumbers: newOrders.map(o => o.order_number),
      duplicates: duplicates,
      imported: 0,
      importSkipped: !autoImport
    };

    // Note: Auto-import would require full scraping (with item details)
    // For now, detection only identifies new order numbers
    if (autoImport && newOrders.length > 0) {
      console.log(chalk.yellow('⚠️  Auto-import requires full order scraping (not yet implemented)'));
      console.log('   For now, detection only identifies new order numbers.');
      console.log('   Use `node cli.js scrape` to import full order details.\n');
    }

    // Update sync metadata
    updateSyncMetadata(db, currentOrderCount + newOrders.length, 'success');

    return result;

  } catch (error) {
    console.error('❌ Detection failed:', error.message);

    // Update metadata with failure status
    updateSyncMetadata(db, currentOrderCount, 'failed');

    throw error;
  }
}

/**
 * Extract orders without importing them
 * Uses the chrome scraper but only returns order metadata
 */
async function extractOrdersOnly(db, chromeTools, maxOrders, onProgress) {
  // We'll reuse the scraping logic but only extract order numbers/dates
  // This is more efficient than full scraping with item details

  let tabId = null;

  try {
    // Step 1: Get or create Chrome tab context
    if (onProgress) onProgress({ step: 'init', message: 'Initializing Chrome...' });

    const context = await chromeTools.tabs_context_mcp({ createIfEmpty: true });
    const tabs = context.tabs || [];

    if (tabs.length === 0) {
      const newTab = await chromeTools.tabs_create_mcp({});
      tabId = newTab.tabId;
    } else {
      tabId = tabs[0].id;
    }

    // Step 2: Navigate to Waitrose order history
    if (onProgress) onProgress({ step: 'navigate', message: 'Navigating to Waitrose...' });

    await chromeTools.navigate({
      tabId,
      url: 'https://www.waitrose.com/ecom/my-account/order-history'
    });

    console.log('📍 Navigated to Waitrose order history page');

    // Wait for page to load
    await sleep(3000);

    // Step 3: Check if login is required
    const pageSnapshot = await chromeTools.read_page({ tabId });
    const pageText = pageSnapshot.text || '';

    if (pageText.toLowerCase().includes('sign in') || pageText.toLowerCase().includes('log in')) {
      console.log('🔐 Login required!');
      console.log('Please log in to Waitrose in the browser window.');
      console.log('Press Enter when you have logged in and see your order history...\n');

      await waitForEnter();

      console.log('✅ Login confirmed\n');
    }

    // Step 4: Extract order data from page
    if (onProgress) onProgress({ step: 'extract', message: 'Extracting orders...' });

    console.log('🔍 Analyzing order history page...');

    const pageTextFull = await chromeTools.get_page_text({ tabId });
    const orders = parseOrdersFromText(pageTextFull);

    return orders.slice(0, maxOrders);

  } catch (error) {
    console.error('Error extracting orders:', error.message);
    throw error;
  }
}

/**
 * Parse orders from page text
 * Extracts order numbers and dates from Waitrose order history
 */
function parseOrdersFromText(pageText) {
  const orders = [];

  try {
    // Extract order numbers (format: #1234567890)
    const orderNumberPattern = /#(\d{10})/g;
    const orderNumbers = [];
    let match;

    while ((match = orderNumberPattern.exec(pageText)) !== null) {
      orderNumbers.push(match[1]);
    }

    // Extract dates (format: "Saturday 3 January", "Thursday 11 December", etc.)
    const datePattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/g;
    const dates = [];

    while ((match = datePattern.exec(pageText)) !== null) {
      const dateStr = `${match[2]} ${match[3]}`; // "3 January"
      const parsedDate = parseDateString(dateStr);
      if (parsedDate) {
        dates.push(parsedDate);
      }
    }

    // Match order numbers with dates (they should appear in pairs)
    const minLength = Math.min(orderNumbers.length, dates.length);

    for (let i = 0; i < minLength; i++) {
      orders.push({
        order_number: orderNumbers[i],
        order_date: dates[i],
        items: [] // Detection doesn't extract full item details
      });
    }

    console.log(`📋 Parsed ${orders.length} orders from page`);

  } catch (error) {
    console.error('Error parsing orders:', error.message);
  }

  return orders;
}

/**
 * Parse date string to ISO format
 * Converts "3 January" to "2025-01-03" (assuming current year)
 */
function parseDateString(dateStr) {
  try {
    const currentYear = new Date().getFullYear();
    const fullDateStr = `${dateStr} ${currentYear}`;
    const date = new Date(fullDateStr);

    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().split('T')[0];
  } catch (error) {
    return null;
  }
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
