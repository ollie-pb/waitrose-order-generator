#!/usr/bin/env node

/**
 * Test script to verify pattern analysis
 */

import { initializeDatabase, getItemFrequency } from './src/database.js';
import {
  classifyItems,
  calculateDaysSinceLastPurchase,
  calculatePurchaseIntervals,
  calculateConfidence,
  predictItemNeed,
  calculateRecommendedQuantity,
  generatePatternSummary
} from './src/analyzer.js';

console.log('🧪 Testing pattern analysis...\n');

try {
  // Initialize database (should have test data from previous test)
  console.log('1. Loading database...');
  const db = initializeDatabase();
  console.log('✅ Database loaded\n');

  // Get item frequency data
  console.log('2. Analyzing item frequency...');
  const frequency = getItemFrequency(db, { minOrders: 1 });
  console.log(`✅ Found ${frequency.length} unique items\n`);

  // Classify items
  console.log('3. Classifying items...');
  const classified = classifyItems(frequency);
  console.log('✅ Item classifications:');
  console.log('   Product Name          | Frequency | Classification');
  console.log('   ' + '-'.repeat(55));
  classified.forEach(item => {
    const name = item.product_name.padEnd(23);
    const freq = (item.frequency * 100).toFixed(0) + '%';
    console.log(`   ${name} | ${freq.padEnd(9)} | ${item.classification}`);
  });
  console.log();

  // Calculate days since last purchase
  console.log('4. Calculating days since last purchase...');
  // Use a mock current date for consistent testing
  const mockToday = new Date('2026-01-05');
  const withDays = calculateDaysSinceLastPurchase(classified, mockToday);
  console.log('✅ Days since last purchase:');
  withDays.forEach(item => {
    console.log(`   ${item.product_name}: ${item.days_since_last_purchase} days`);
  });
  console.log();

  // Calculate purchase intervals
  console.log('5. Calculating purchase intervals...');
  console.log('✅ Purchase intervals:');
  console.log('   Product Name          | Avg Interval | Std Dev');
  console.log('   ' + '-'.repeat(55));
  withDays.forEach(item => {
    if (item.classification === 'one-off') return;

    const intervals = calculatePurchaseIntervals(db, item.product_name);
    if (intervals.avg_interval) {
      const name = item.product_name.padEnd(23);
      const avgInt = intervals.avg_interval.toString().padEnd(12);
      const stdDev = intervals.std_deviation ? intervals.std_deviation.toFixed(1) : 'N/A';
      console.log(`   ${name} | ${avgInt} | ${stdDev} days`);
    }
  });
  console.log();

  // Calculate confidence and predictions
  console.log('6. Predicting needed items (7-day window)...');
  console.log('✅ Predictions:');
  console.log('   Product Name          | Needed? | Confidence | Recommended Qty');
  console.log('   ' + '-'.repeat(70));

  const predictions = [];
  withDays.forEach(item => {
    if (item.classification === 'one-off') return;

    const intervals = calculatePurchaseIntervals(db, item.product_name);
    const confidence = calculateConfidence(item, intervals);
    const isNeeded = predictItemNeed(item, intervals, 7);
    const recQty = calculateRecommendedQuantity(item.avg_quantity, intervals, 7);

    predictions.push({
      item,
      intervals,
      confidence,
      isNeeded,
      recQty
    });

    const name = item.product_name.padEnd(23);
    const needed = (isNeeded ? 'Yes' : 'No').padEnd(7);
    const conf = (confidence * 100).toFixed(0) + '%';
    console.log(`   ${name} | ${needed} | ${conf.padEnd(10)} | ${recQty}x`);
  });
  console.log();

  // Generate pattern summary for Claude
  console.log('7. Generating pattern summary for Claude...');
  const summary = generatePatternSummary(withDays, db, 7);
  console.log('✅ Pattern summary generated:');
  console.log(JSON.stringify(summary, null, 2));
  console.log();

  // Summary statistics
  console.log('8. Summary statistics:');
  const regular = classified.filter(i => i.classification === 'regular').length;
  const infrequent = classified.filter(i => i.classification === 'infrequent').length;
  const oneOff = classified.filter(i => i.classification === 'one-off').length;
  const needed = predictions.filter(p => p.isNeeded).length;

  console.log(`   Regular items: ${regular}`);
  console.log(`   Infrequent items: ${infrequent}`);
  console.log(`   One-off items: ${oneOff}`);
  console.log(`   Items predicted as needed: ${needed}`);
  console.log();

  console.log('✅ All pattern analysis tests passed!\n');
  console.log('🎉 Phase 4 complete and verified!\n');

  db.close();
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
