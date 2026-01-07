/**
 * Order detection coordinator
 * Checks for new Waitrose orders since last scrape
 */

import chalk from 'chalk';
import { extractOrderMetadata } from './chrome-scraper.js';
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
    // Use chrome-scraper to extract order metadata from Waitrose
    // The scraper handles:
    // - Chrome initialization
    // - Navigation to order history
    // - Login prompts
    // - Order extraction
    const extractedOrders = await extractOrderMetadata(chromeTools, maxOrders, onProgress);

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

    // Update sync metadata atomically
    // Wrapped in transaction to ensure consistency
    const updateMetadata = db.transaction(() => {
      // Read actual current count from database (not stale value from line 31)
      const actualOrderCount = getOrderCount(db);
      updateSyncMetadata(db, actualOrderCount, 'success');
      return actualOrderCount;
    });

    const finalCount = updateMetadata();
    console.log(`✅ Sync metadata updated (${finalCount} orders in database)\n`);

    return result;

  } catch (error) {
    console.error('❌ Detection failed:', error.message);

    // Update metadata with failure status atomically
    const updateFailure = db.transaction(() => {
      const actualOrderCount = getOrderCount(db);
      updateSyncMetadata(db, actualOrderCount, 'failed');
      return actualOrderCount;
    });

    updateFailure();

    throw error;
  }
}
