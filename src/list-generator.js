/**
 * Shopping List Generator - Core Logic
 * Extracted for use by both CLI and Claude Code
 */

import {
  initializeDatabase,
  getItemFrequency,
  saveShoppingList,
  getOrderCount
} from './database.js';
import {
  classifyItems,
  calculateDaysSinceLastPurchase,
  generatePatternSummary
} from './analyzer.js';
import { generateShoppingList } from './claude-client.js';

/**
 * Generate a shopping list with AI recommendations
 * @param {Object} options - Generation options
 * @param {number} options.daysCoverage - Days to cover (5-8, default: 7)
 * @param {boolean} options.save - Save to database (default: true)
 * @returns {Promise<Object>} { recommendations, usage, listId, db }
 */
export async function generateShoppingListWithOptions(options = {}) {
  const {
    daysCoverage = 7,
    save = true
  } = options;

  // Validate days coverage
  if (daysCoverage < 5 || daysCoverage > 8) {
    throw new Error('Days must be between 5 and 8');
  }

  // Initialize database
  const db = initializeDatabase();

  // Check if we have enough orders
  const orderCount = getOrderCount(db);
  if (orderCount < 3) {
    db.close();
    throw new Error(`Only ${orderCount} orders found. Need at least 3 for pattern analysis.`);
  }

  // Analyze patterns
  const frequency = getItemFrequency(db, { minOrders: 2 });
  const classified = classifyItems(frequency);
  const withDays = calculateDaysSinceLastPurchase(classified);
  const patternSummary = generatePatternSummary(withDays, db, daysCoverage);

  const totalNeeded = patternSummary.regularItems.length + patternSummary.infrequentItems.length;

  if (totalNeeded === 0) {
    db.close();
    throw new Error(`No items predicted as needed for the next ${daysCoverage} days`);
  }

  // Generate recommendations with Claude
  const result = await generateShoppingList(patternSummary, { daysCoverage });

  // Save to database if requested
  let listId = null;
  if (save) {
    listId = saveShoppingList(db, daysCoverage, result.recommendations);
  }

  return {
    recommendations: result.recommendations,
    usage: result.usage,
    listId,
    db,  // Return db for caller to close
    orderCount,
    totalNeeded
  };
}

/**
 * Generate shopping list for Claude Code integration
 * Includes basket automation support
 * @param {Object} chromeTools - Chrome MCP tools from Claude Code
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation results
 */
export async function generateForClaudeCode(chromeTools, options = {}) {
  // Generate the list
  const result = await generateShoppingListWithOptions(options);

  // Return result with Chrome tools attached for automation
  return {
    ...result,
    chromeTools  // Make Chrome tools available for basket automation
  };
}
