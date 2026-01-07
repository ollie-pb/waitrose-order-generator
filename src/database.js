import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '..', 'data', 'shopping.db');

/**
 * Initialize database connection and create schema
 */
export function initializeDatabase() {
  const db = new Database(DB_PATH);

  // CRITICAL: Enable foreign keys FIRST (before any operations)
  db.pragma('foreign_keys = ON');

  // Verify foreign keys are enabled
  const fkStatus = db.pragma('foreign_keys', { simple: true });
  if (!fkStatus) {
    throw new Error('Failed to enable foreign key constraints');
  }

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create schema
  db.exec(`
    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      order_date TEXT NOT NULL,
      scraped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Order items table
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    -- Shopping lists table
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      days_coverage INTEGER NOT NULL
    );

    -- Shopping list items table
    CREATE TABLE IF NOT EXISTS shopping_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      classification TEXT CHECK(classification IN ('regular', 'infrequent')) NOT NULL,
      confidence REAL,
      FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
    );

    -- Sync metadata table for tracking detection runs
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      last_sync_time TEXT,
      last_sync_timestamp INTEGER,
      order_count_at_sync INTEGER,
      status TEXT CHECK(status IN ('success', 'partial', 'failed'))
    );

    -- Initialize sync metadata if not exists
    INSERT OR IGNORE INTO sync_metadata
    (key, last_sync_time, last_sync_timestamp, order_count_at_sync, status)
    VALUES ('waitrose_orders', NULL, 0, 0, 'success');

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_order_items_name ON order_items(product_name);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  `);

  return db;
}

/**
 * Insert or update an order
 */
export function insertOrder(db, orderData) {
  const insertOrderStmt = db.prepare(`
    INSERT OR IGNORE INTO orders (order_number, order_date, scraped_at)
    VALUES (?, ?, datetime('now'))
  `);

  const result = insertOrderStmt.run(orderData.order_number, orderData.order_date);

  if (result.changes === 0) {
    // Order already exists, get its ID
    const existing = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(orderData.order_number);
    return existing.id;
  }

  return result.lastInsertRowid;
}

/**
 * Insert order items
 */
export function insertOrderItems(db, orderId, items) {
  const insertItemStmt = db.prepare(`
    INSERT INTO order_items (order_id, product_name, quantity)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertItemStmt.run(orderId, item.product_name, item.quantity);
    }
  });

  insertMany(items);
}

/**
 * Get recent orders (last N orders or within date range)
 */
export function getRecentOrders(db, options = {}) {
  const { limit = 50, since = null } = options;

  let query = `
    SELECT
      o.id,
      o.order_number,
      o.order_date,
      o.scraped_at
    FROM orders o
  `;

  const params = [];

  if (since) {
    query += ` WHERE o.order_date >= ?`;
    params.push(since);
  }

  query += ` ORDER BY o.order_date DESC LIMIT ?`;
  params.push(limit);

  return db.prepare(query).all(...params);
}

/**
 * Get all items for specific orders
 */
export function getOrderItems(db, orderIds) {
  if (orderIds.length === 0) return [];

  const placeholders = orderIds.map(() => '?').join(',');
  const query = `
    SELECT
      oi.order_id,
      oi.product_name,
      oi.quantity,
      o.order_date
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE oi.order_id IN (${placeholders})
    ORDER BY o.order_date DESC, oi.product_name
  `;

  return db.prepare(query).all(...orderIds);
}

/**
 * Get item frequency analysis
 * Returns stats for each unique item: total purchases, frequency, avg quantity
 */
export function getItemFrequency(db, options = {}) {
  const { minOrders = 3 } = options;

  const query = `
    SELECT
      oi.product_name,
      COUNT(DISTINCT oi.order_id) as purchase_count,
      (SELECT COUNT(*) FROM orders) as total_orders,
      CAST(COUNT(DISTINCT oi.order_id) AS REAL) / (SELECT COUNT(*) FROM orders) as frequency,
      AVG(oi.quantity) as avg_quantity,
      MAX(o.order_date) as last_purchase_date
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    GROUP BY oi.product_name
    HAVING purchase_count >= ?
    ORDER BY frequency DESC, purchase_count DESC
  `;

  return db.prepare(query).all(minOrders);
}

/**
 * Save shopping list and its items
 */
export function saveShoppingList(db, daysCoverage, items) {
  const insertListStmt = db.prepare(`
    INSERT INTO shopping_lists (days_coverage)
    VALUES (?)
  `);

  const insertItemStmt = db.prepare(`
    INSERT INTO shopping_list_items
    (list_id, product_name, quantity, classification, confidence)
    VALUES (?, ?, ?, ?, ?)
  `);

  const saveTransaction = db.transaction((daysCoverage, items) => {
    const result = insertListStmt.run(daysCoverage);
    const listId = result.lastInsertRowid;

    for (const item of items) {
      insertItemStmt.run(
        listId,
        item.item,
        item.quantity,
        item.classification,
        item.confidence
      );
    }

    return listId;
  });

  return saveTransaction(daysCoverage, items);
}

/**
 * Get shopping list by ID
 */
export function getShoppingList(db, listId) {
  const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(listId);

  if (!list) return null;

  const items = db.prepare(`
    SELECT * FROM shopping_list_items WHERE list_id = ? ORDER BY classification, product_name
  `).all(listId);

  return {
    ...list,
    items
  };
}

/**
 * Get all shopping lists
 */
export function getAllShoppingLists(db) {
  const lists = db.prepare(`
    SELECT
      sl.*,
      COUNT(sli.id) as item_count
    FROM shopping_lists sl
    LEFT JOIN shopping_list_items sli ON sl.id = sli.list_id
    GROUP BY sl.id
    ORDER BY sl.generated_at DESC
  `).all();

  return lists;
}

/**
 * Get order count
 */
export function getOrderCount(db) {
  const result = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  return result.count;
}

/**
 * Clear all data (for testing)
 */
export function clearAllData(db) {
  db.exec(`
    DELETE FROM shopping_list_items;
    DELETE FROM shopping_lists;
    DELETE FROM order_items;
    DELETE FROM orders;
  `);
}

/**
 * Get last sync timestamp
 */
export function getLastSyncTime(db) {
  const result = db.prepare(`
    SELECT last_sync_time, last_sync_timestamp
    FROM sync_metadata
    WHERE key = 'waitrose_orders'
  `).get();

  return result ? {
    time: result.last_sync_time,
    timestamp: result.last_sync_timestamp
  } : { time: null, timestamp: 0 };
}

/**
 * Update sync metadata after detection
 */
export function updateSyncMetadata(db, orderCount, status = 'success') {
  const now = new Date();
  const isoTime = now.toISOString();
  const unixTime = Math.floor(now.getTime() / 1000);

  const stmt = db.prepare(`
    UPDATE sync_metadata
    SET
      last_sync_time = ?,
      last_sync_timestamp = ?,
      order_count_at_sync = ?,
      status = ?
    WHERE key = 'waitrose_orders'
  `);

  stmt.run(isoTime, unixTime, orderCount, status);
}

/**
 * Filter to only new orders (not in database)
 * Uses bulk query to avoid N+1 performance problem
 */
export function filterExistingOrders(db, orders) {
  if (orders.length === 0) {
    return [];
  }

  // Extract all order numbers for bulk query
  const orderNumbers = orders.map(o => o.order_number);

  // Build placeholders for IN clause (?, ?, ?, ...)
  const placeholders = orderNumbers.map(() => '?').join(', ');

  // Single bulk query instead of N individual queries
  const query = `SELECT order_number FROM orders WHERE order_number IN (${placeholders})`;
  const existingOrders = db.prepare(query).all(...orderNumbers);

  // Convert to Set for O(1) lookup
  const existingSet = new Set(existingOrders.map(row => row.order_number));

  // Filter out existing orders
  return orders.filter(order => !existingSet.has(order.order_number));
}
