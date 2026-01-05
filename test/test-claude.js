#!/usr/bin/env node

/**
 * Test script to verify Claude API integration
 */

import { testConnection, generateShoppingList } from './src/claude-client.js';
import { initializeDatabase, getItemFrequency } from './src/database.js';
import {
  classifyItems,
  calculateDaysSinceLastPurchase,
  generatePatternSummary
} from './src/analyzer.js';

console.log('🧪 Testing Claude API integration...\n');

// Check for API key first
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set in environment\n');
  console.log('To run this test:');
  console.log('1. Copy .env.example to .env: cp .env.example .env');
  console.log('2. Add your Anthropic API key to .env');
  console.log('3. Run this test again\n');
  process.exit(1);
}

try {
  // Test 1: API connection
  console.log('1. Testing API connection...');
  const connectionTest = await testConnection();

  if (!connectionTest.success) {
    console.error('❌ Connection failed:', connectionTest.error);
    process.exit(1);
  }

  console.log('✅ Connected to Claude API');
  console.log(`   Model: ${connectionTest.model}`);
  console.log(`   Response: ${connectionTest.response}\n`);

  // Test 2: Generate shopping list from mock data
  console.log('2. Testing shopping list generation...');

  // Load pattern data from database
  const db = initializeDatabase();
  const frequency = getItemFrequency(db, { minOrders: 1 });
  const classified = classifyItems(frequency);
  const mockToday = new Date('2026-01-05');
  const withDays = calculateDaysSinceLastPurchase(classified, mockToday);
  const patternSummary = generatePatternSummary(withDays, db, 7);

  console.log('Pattern summary:');
  console.log(JSON.stringify(patternSummary, null, 2));
  console.log();

  console.log('Sending to Claude for analysis...');
  const result = await generateShoppingList(patternSummary, { daysCoverage: 7 });

  console.log(`✅ Shopping list generated!`);
  console.log(`   Input tokens: ${result.usage.input_tokens}`);
  console.log(`   Output tokens: ${result.usage.output_tokens}`);
  console.log();

  // Display recommendations
  console.log('3. Recommendations:');
  console.log('   Item                  | Qty | Type       | Confidence | Reason');
  console.log('   ' + '-'.repeat(80));

  result.recommendations.forEach(rec => {
    const item = rec.item.padEnd(20);
    const qty = rec.quantity.toString().padEnd(3);
    const type = rec.classification.padEnd(10);
    const conf = (rec.confidence * 100).toFixed(0) + '%';
    const reason = rec.reason.length > 30 ? rec.reason.substring(0, 27) + '...' : rec.reason;
    console.log(`   ${item} | ${qty} | ${type} | ${conf.padEnd(10)} | ${reason}`);
  });
  console.log();

  console.log('✅ All Claude API tests passed!\n');
  console.log('🎉 Phase 3a complete and verified!\n');

  db.close();
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
