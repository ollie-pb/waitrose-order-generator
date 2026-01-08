#!/usr/bin/env node

/**
 * Test script to verify database setup and basic operations
 */

import {
  initializeDatabase,
  insertOrder,
  insertOrderItems,
  getRecentOrders,
  getOrderItems,
  getItemFrequency,
  saveShoppingList,
  getShoppingList,
  getAllShoppingLists,
  getOrderCount,
  clearAllData
} from '../src/database.js';

console.log('🧪 Testing database setup...\n');

try {
  // Initialize database
  console.log('1. Initializing database...');
  const db = initializeDatabase();
  console.log('✅ Database initialized\n');

  // Clear any existing data
  console.log('2. Clearing existing data...');
  clearAllData(db);
  console.log('✅ Data cleared\n');

  // Test: Insert mock orders
  console.log('3. Testing order insertion...');
  const mockOrders = [
    {
      order_number: 'WTR001',
      order_date: '2025-12-01',
      items: [
        { product_name: 'Organic Milk', quantity: 2 },
        { product_name: 'Whole Wheat Bread', quantity: 1 },
        { product_name: 'Avocados', quantity: 4 }
      ]
    },
    {
      order_number: 'WTR002',
      order_date: '2025-12-08',
      items: [
        { product_name: 'Organic Milk', quantity: 2 },
        { product_name: 'Whole Wheat Bread', quantity: 1 },
        { product_name: 'Bananas', quantity: 6 }
      ]
    },
    {
      order_number: 'WTR003',
      order_date: '2025-12-15',
      items: [
        { product_name: 'Organic Milk', quantity: 2 },
        { product_name: 'Avocados', quantity: 4 },
        { product_name: 'Steak', quantity: 2 }
      ]
    },
    {
      order_number: 'WTR004',
      order_date: '2025-12-22',
      items: [
        { product_name: 'Organic Milk', quantity: 2 },
        { product_name: 'Whole Wheat Bread', quantity: 1 },
        { product_name: 'Bananas', quantity: 6 }
      ]
    }
  ];

  for (const order of mockOrders) {
    const orderId = insertOrder(db, {
      order_number: order.order_number,
      order_date: order.order_date
    });
    insertOrderItems(db, orderId, order.items);
  }

  const orderCount = getOrderCount(db);
  console.log(`✅ Inserted ${orderCount} orders\n`);

  // Test: Get recent orders
  console.log('4. Testing order retrieval...');
  const recentOrders = getRecentOrders(db, { limit: 10 });
  console.log(`✅ Retrieved ${recentOrders.length} recent orders:`);
  recentOrders.forEach(order => {
    console.log(`   - ${order.order_number} (${order.order_date})`);
  });
  console.log();

  // Test: Get order items
  console.log('5. Testing order items retrieval...');
  const orderIds = recentOrders.map(o => o.id);
  const items = getOrderItems(db, orderIds);
  console.log(`✅ Retrieved ${items.length} items across all orders\n`);

  // Test: Item frequency analysis
  console.log('6. Testing frequency analysis...');
  const frequency = getItemFrequency(db, { minOrders: 1 });
  console.log('✅ Item frequency analysis:');
  console.log('   Product Name          | Purchases | Frequency | Avg Qty');
  console.log('   ' + '-'.repeat(60));
  frequency.forEach(item => {
    const name = item.product_name.padEnd(23);
    const purchases = item.purchase_count.toString().padEnd(9);
    const freq = (item.frequency * 100).toFixed(0) + '%';
    const avgQty = item.avg_quantity.toFixed(1);
    console.log(`   ${name} | ${purchases} | ${freq.padEnd(9)} | ${avgQty}`);
  });
  console.log();

  // Test: Save shopping list
  console.log('7. Testing shopping list save...');
  const mockList = [
    { item: 'Organic Milk', quantity: 2, classification: 'regular', confidence: 0.95 },
    { item: 'Whole Wheat Bread', quantity: 1, classification: 'regular', confidence: 0.85 },
    { item: 'Avocados', quantity: 4, classification: 'regular', confidence: 0.75 }
  ];

  const listId = saveShoppingList(db, 7, mockList);
  console.log(`✅ Saved shopping list with ID: ${listId}\n`);

  // Test: Get shopping list
  console.log('8. Testing shopping list retrieval...');
  const savedList = getShoppingList(db, listId);
  console.log(`✅ Retrieved shopping list:`);
  console.log(`   Generated: ${savedList.generated_at}`);
  console.log(`   Coverage: ${savedList.days_coverage} days`);
  console.log(`   Items: ${savedList.items.length}`);
  savedList.items.forEach(item => {
    console.log(`     - ${item.product_name} (${item.quantity}x) [${item.classification}]`);
  });
  console.log();

  // Test: Get all lists
  console.log('9. Testing all lists retrieval...');
  const allLists = getAllShoppingLists(db);
  console.log(`✅ Total shopping lists: ${allLists.length}\n`);

  console.log('✅ All database tests passed!\n');
  console.log('📊 Database file created at: data/shopping.db');
  console.log('🎉 Phase 1-2 complete and verified!\n');

  db.close();
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
