# New Order Detector - Implementation Plan

## Overview

Add a `detect` command to automatically check for new Waitrose orders since the last scrape and optionally import them. This keeps shopping pattern analysis fresh without manual re-scraping of all historical orders.

**Type:** Feature Enhancement
**Priority:** High (enables automation)
**Complexity:** Medium
**Estimated Effort:** 4-6 hours

## Problem Statement

Currently, users must manually navigate through all 15+ orders each time they want to update their dataset. This is time-consuming and doesn't scale well as the order history grows. Users need a way to quickly check for and import only new orders added since their last scrape.

**Current Pain Points:**
- Manual scraping of all orders takes 10+ minutes
- No way to detect which orders are new vs. already scraped
- Pattern analysis becomes stale as new orders aren't added
- No automation support for keeping data fresh

## Proposed Solution

Implement a new CLI command `node cli.js detect` that:

1. Retrieves the most recent `scraped_at` timestamp from the database
2. Navigates to Waitrose order history using Claude in Chrome MCP tools
3. Extracts visible orders from the page
4. Filters to only orders not already in the database (by `order_number`)
5. Optionally imports new orders with `--auto-import` flag
6. Reports a summary of findings

**Key Benefits:**
- ✅ 90% faster than full re-scrape (checks only, no manual navigation)
- ✅ Enables automated order syncing (cron jobs, scheduled tasks)
- ✅ Keeps pattern analysis fresh with minimal effort
- ✅ Idempotent - safe to run multiple times

## Technical Approach

### Architecture

**Data Flow:**
```
User Command → CLI Parser → Detector → Chrome Scraper → Order Extractor
                                 ↓
                          Database Filter
                                 ↓
                    Optional Import → Database
                                 ↓
                          Summary Report
```

**Key Components:**

1. **CLI Command Handler** (`cli.js`)
   - Parses command and options
   - Orchestrates detection workflow
   - Displays results with spinners/formatting

2. **Detection Logic** (`src/detector.js` - NEW FILE)
   - Coordinates scraping and filtering
   - Manages state tracking
   - Handles error scenarios

3. **Order Extraction** (`src/chrome-scraper.js` - ENHANCE)
   - Implement `parseOrdersFromText()` function
   - Handle pagination/scrolling
   - Extract order metadata (number, date)

4. **Database Layer** (`src/database.js` - ENHANCE)
   - Add sync metadata tracking
   - Query for new orders efficiently
   - Batch import with transactions

### Implementation Phases

#### Phase 1: Database Enhancement

**File:** `src/database.js`

**Tasks:**
1. Create sync metadata table
   ```sql
   CREATE TABLE IF NOT EXISTS sync_metadata (
     key TEXT PRIMARY KEY,
     last_sync_time TEXT,
     last_sync_timestamp INTEGER,
     order_count_at_sync INTEGER,
     status TEXT CHECK(status IN ('success', 'partial', 'failed'))
   );
   ```

2. Add sync tracking functions:
   - `getLastSyncTime(db)` - Retrieve last successful sync timestamp
   - `updateSyncMetadata(db, orderCount, status)` - Update after detection
   - `shouldSync(db, minIntervalMinutes)` - Check if sync needed (optional)

3. Add efficient new order query:
   - `getNewOrdersSinceSync(db, sinceTimestamp)` - Get orders added after timestamp
   - `filterExistingOrders(db, orders)` - Filter out duplicates before import

**Success Criteria:**
- [ ] Sync metadata table created on initialization
- [ ] Last sync timestamp retrieves correctly
- [ ] Metadata updates atomically with order imports
- [ ] Existing order filtering prevents duplicate imports

#### Phase 2: Order Extraction Logic

**File:** `src/chrome-scraper.js`

**Tasks:**
1. Implement `parseOrdersFromText(pageText)`:
   - Extract order numbers using regex pattern: `#(\d{10})`
   - Extract order dates from text (e.g., "Saturday 3 January")
   - Return array of `{ order_number, order_date }` objects

2. Add pagination detection:
   - Implement `scrollThroughOrders(tabId, maxOrders)` function
   - Detect when no new content loads after scroll
   - Stop after `maxNoChangeAttempts` (default: 3)

3. Enhance `extractOrdersFromPage(tabId)`:
   - Use `get_page_text()` to get full order list
   - Parse all visible orders
   - Return structured data for filtering

**Example Implementation:**
```javascript
// src/chrome-scraper.js (NEW FUNCTION)
function parseOrdersFromText(pageText) {
  const orders = [];
  const orderPattern = /#(\d{10})/g;
  const datePattern = /(\w+\s\d{1,2}\s\w+)/g;

  let orderMatch;
  const orderNumbers = [];
  while ((orderMatch = orderPattern.exec(pageText)) !== null) {
    orderNumbers.push(orderMatch[1]);
  }

  const dates = [];
  let dateMatch;
  while ((dateMatch = datePattern.exec(pageText)) !== null) {
    dates.push(parseDateString(dateMatch[1]));
  }

  for (let i = 0; i < Math.min(orderNumbers.length, dates.length); i++) {
    orders.push({
      order_number: orderNumbers[i],
      order_date: dates[i]
    });
  }

  return orders;
}

function parseDateString(dateStr) {
  // Convert "Saturday 3 January" to ISO format "2025-01-03"
  const date = new Date(dateStr + ' 2025'); // Assume current year
  return date.toISOString().split('T')[0];
}
```

**Success Criteria:**
- [ ] Parses order numbers and dates from Waitrose HTML
- [ ] Handles various date formats gracefully
- [ ] Returns empty array on parsing failure (no crash)
- [ ] Scrolls through pagination to load all orders

#### Phase 3: Detection Coordinator

**File:** `src/detector.js` (NEW FILE)

**Tasks:**
1. Create detection workflow function:
   ```javascript
   export async function detectNewOrders(db, chromeTools, options = {}) {
     const { autoImport = false, maxOrders = 50 } = options;

     // 1. Get last sync timestamp
     const lastSync = getLastSyncTime(db);

     // 2. Initialize Chrome and navigate
     const tabId = await initializeChromeWithRetry(chromeTools);
     await navigateToOrderHistory(chromeTools, tabId);

     // 3. Check if login required
     if (await requiresLogin(chromeTools, tabId)) {
       await promptUserLogin();
     }

     // 4. Extract orders from page
     const extractedOrders = await extractOrdersFromPage(chromeTools, tabId);

     // 5. Filter to new orders only
     const newOrders = filterExistingOrders(db, extractedOrders);

     // 6. Optionally import
     let importResult = null;
     if (autoImport && newOrders.length > 0) {
       importResult = batchImportOrders(db, newOrders);
       updateSyncMetadata(db, importResult.inserted, 'success');
     }

     // 7. Return summary
     return {
       lastSync: lastSync.time,
       totalExtracted: extractedOrders.length,
       newOrders: newOrders.length,
       duplicates: extractedOrders.length - newOrders.length,
       imported: autoImport ? importResult?.inserted : 0,
       importSkipped: !autoImport
     };
   }
   ```

2. Add helper functions:
   - `initializeChromeWithRetry(chromeTools, maxRetries)` - Robust Chrome init
   - `navigateToOrderHistory(chromeTools, tabId)` - Navigate to order page
   - `promptUserLogin()` - Wait for user to login manually

**Success Criteria:**
- [ ] Coordinates all detection steps
- [ ] Handles errors gracefully
- [ ] Returns comprehensive summary
- [ ] Works both with and without --auto-import

#### Phase 4: CLI Command

**File:** `cli.js`

**Tasks:**
1. Add `detect` command with Commander.js:
   ```javascript
   program
     .command('detect')
     .description('Check for new orders since last scrape')
     .option('--auto-import', 'Automatically import new orders')
     .option('--max <number>', 'Maximum orders to check', '50')
     .action(async (options) => {
       const spinner = ora('Checking for new orders...').start();

       try {
         const db = initializeDatabase();
         const chromeTools = getChromeTools(); // Get MCP tools

         const result = await detectNewOrders(db, chromeTools, {
           autoImport: options.autoImport,
           maxOrders: parseInt(options.max)
         });

         spinner.succeed('Detection complete');
         displayDetectionSummary(result);

         db.close();
       } catch (error) {
         spinner.fail('Detection failed');
         displayError(error);
         process.exit(1);
       }
     });
   ```

2. Add summary formatter:
   ```javascript
   function displayDetectionSummary(result) {
     console.log(chalk.bold('\n📋 Detection Summary'));
     console.log('════════════════════════════════════════');
     console.log(`Last sync: ${result.lastSync || 'Never'}`);
     console.log(`Orders checked: ${result.totalExtracted}`);
     console.log(chalk.green(`✓ New orders: ${result.newOrders}`));
     console.log(chalk.gray(`- Already imported: ${result.duplicates}`));

     if (result.importSkipped) {
       console.log(chalk.yellow(`\nℹ  Use --auto-import to save new orders`));
     } else if (result.imported > 0) {
       console.log(chalk.green(`\n✓ Imported ${result.imported} orders`));
     }
   }
   ```

**Success Criteria:**
- [ ] Command appears in help text
- [ ] --auto-import flag works correctly
- [ ] Summary displays clearly
- [ ] Errors handled gracefully

## Acceptance Criteria

### Functional Requirements

- [ ] `node cli.js detect` command runs without errors
- [ ] Detection identifies orders not in database
- [ ] `--auto-import` flag imports new orders
- [ ] Duplicate orders are skipped (UNIQUE constraint)
- [ ] Last sync timestamp is tracked and displayed
- [ ] Summary shows: last sync, new orders, duplicates, import status

### Non-Functional Requirements

- [ ] Detection completes in <30 seconds for typical case (5-10 new orders)
- [ ] Handles pagination if Waitrose shows 20+ orders
- [ ] Works correctly with empty database (first-time use)
- [ ] Idempotent - running twice produces same result
- [ ] Graceful error handling for network issues
- [ ] Clear error messages for common failures

### Quality Gates

- [ ] No regressions in existing commands (generate, scrape, history, stats)
- [ ] Database transactions ensure atomicity
- [ ] All new functions have descriptive names
- [ ] Code follows existing patterns (Commander.js, ora spinners, chalk colors)

## Alternative Approaches Considered

### Alternative 1: Full Re-Scrape with Smart Skip

**Description:** Enhance existing `scrape` command to skip already-imported orders

**Pros:**
- Reuses existing scraper code
- No new command needed
- Simpler implementation

**Cons:**
- Still requires navigating through all orders (slow)
- Doesn't track "new since last sync" semantically
- Harder to automate (always interactive)

**Decision:** Rejected. Separate `detect` command provides clearer intent and faster execution.

### Alternative 2: Waitrose API Integration

**Description:** Use Waitrose's private API (if available) instead of browser scraping

**Pros:**
- Much faster (API calls vs. browser automation)
- More reliable (structured JSON vs. HTML parsing)
- No Chrome dependency

**Cons:**
- No public Waitrose API documented
- Would require reverse-engineering their API
- API may require authentication/tokens
- Risk of breaking if API changes

**Decision:** Deferred. Browser scraping is the only documented approach. Can reconsider if Waitrose publishes an official API.

### Alternative 3: Background Sync Service

**Description:** Run detection as background service, syncing every N hours

**Pros:**
- Fully automated
- Always up-to-date
- No manual intervention

**Cons:**
- Requires daemon/service setup
- More complex deployment
- Requires persistent Chrome session
- May violate Waitrose ToS with automated scraping

**Decision:** Out of scope for v0.2. Users can achieve this with cron jobs if desired.

## Success Metrics

### Quantitative Metrics

- **Time Savings:** Detection should be 90%+ faster than full scrape (< 30s vs. 10+ minutes)
- **Automation Rate:** Enable 100% of users to automate with cron (via --auto-import)
- **Accuracy:** 100% of new orders detected (no false negatives)
- **Reliability:** < 5% failure rate for typical network conditions

### Qualitative Metrics

- Users report reduced friction in keeping data fresh
- Positive feedback on automation capability
- Clear error messages reduce support burden

## Dependencies & Risks

### Prerequisites

- ✅ Claude in Chrome MCP tools installed and working
- ✅ Database schema with `scraped_at` timestamps
- ✅ Unique constraint on `order_number` (prevents duplicates)
- ✅ Existing `insertOrder()` and `insertOrderItems()` functions

### Dependencies

- **Chrome Browser:** Must be running for MCP tools to work
- **Network:** Requires internet connection to Waitrose
- **Waitrose Account:** User must be logged in to view orders

### Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Waitrose HTML structure changes | High | Medium | Fail gracefully with clear error; version check mechanism |
| Pagination not detected correctly | Medium | Low | Conservative scroll detection; --max limit prevents infinite loops |
| Large number of new orders (100+) | Low | Low | Progress indicators; batch imports with transactions |
| Chrome/MCP unavailable | High | Low | Clear error message; suggest workarounds |
| User not logged in | Medium | Medium | Interactive login prompt (existing pattern) |

## Technical Considerations

### Performance

- **Pagination:** Auto-scroll may take 10-30 seconds for large histories
- **Database Queries:** Indexed queries on `order_number` ensure O(log n) lookups
- **Batch Imports:** Transaction-based imports handle 100+ orders efficiently

### Security

- **No Credentials Stored:** Uses Chrome session; no password storage
- **Privacy-First:** Only order metadata stored locally
- **No API Keys Required:** Browser-based scraping

### Accessibility

- **CLI-Only:** Terminal interface (consistent with existing commands)
- **Clear Output:** Spinners, colors, formatted tables for readability
- **Error Messages:** Descriptive errors for common failures

## Future Considerations

### Extensibility

- **Scheduled Sync:** Add `--schedule` flag for cron-like setup
- **Webhook Notifications:** Alert when new orders detected
- **Dry Run Mode:** `--dry-run` to preview without importing
- **Date Filtering:** `--since "7 days ago"` to limit scope

### Long-Term Vision

- **Multi-Store Support:** Detect orders from Tesco, Sainsbury's
- **Change Detection:** Track when existing orders are modified
- **Order Status:** Track delivery status, cancellations, returns

## Documentation Plan

### Files to Update

1. **README.md**
   - Add `detect` command to usage section
   - Document --auto-import flag
   - Add example usage

2. **CLAUDE.md**
   - Document detection workflow
   - Note Waitrose HTML parsing assumptions
   - Add troubleshooting guidance

3. **CLI Help Text**
   - Command description
   - Flag documentation
   - Examples

### Example Usage Documentation

```bash
# Check for new orders (preview only)
node cli.js detect

# Auto-import new orders
node cli.js detect --auto-import

# Check only last 20 orders
node cli.js detect --max 20

# Automate with cron (every day at 9am)
0 9 * * * cd /path/to/project && node cli.js detect --auto-import >> sync.log 2>&1
```

## References & Research

### Internal References

- **Database Schema:** `src/database.js:19-59` (orders table definition)
- **Scraper Structure:** `src/chrome-scraper.js:36-85` (initialization and navigation)
- **CLI Pattern:** `cli.js:37-114` (generate command as reference)
- **Unique Constraint:** `src/database.js:23` (`order_number TEXT UNIQUE NOT NULL`)

### External References

- **Claude in Chrome Docs:** https://code.claude.com/docs/en/chrome
- **better-sqlite3 Transactions:** https://github.com/wiselibs/better-sqlite3/blob/master/docs/api.md#transaction
- **SQLite UPSERT:** https://sqlite.org/lang_upsert.html
- **Incremental Sync Patterns:** https://skyvia.com/learn/what-is-data-synchronization

### Best Practices

- **Watermark Strategy:** Track last sync timestamp for efficient incremental detection
- **Idempotent Operations:** INSERT OR IGNORE ensures safe re-runs
- **Exponential Backoff:** Retry network operations with increasing delays
- **Batch Transactions:** Use transactions for atomic multi-order imports

## MVP Implementation Checklist

### Phase 1: Database (1-2 hours)
- [ ] Create `sync_metadata` table in `database.js`
- [ ] Implement `getLastSyncTime(db)` function
- [ ] Implement `updateSyncMetadata(db, orderCount, status)` function
- [ ] Implement `filterExistingOrders(db, orders)` function
- [ ] Test with existing 15-order dataset

### Phase 2: Order Extraction (1-2 hours)
- [ ] Implement `parseOrdersFromText(pageText)` in `chrome-scraper.js`
- [ ] Add `parseDateString(dateStr)` helper
- [ ] Test parsing with real Waitrose HTML
- [ ] Implement `scrollThroughOrders(tabId, maxOrders)` for pagination
- [ ] Test pagination detection

### Phase 3: Detection Logic (1 hour)
- [ ] Create `src/detector.js` file
- [ ] Implement `detectNewOrders(db, chromeTools, options)` function
- [ ] Implement `initializeChromeWithRetry()` helper
- [ ] Implement `navigateToOrderHistory()` helper
- [ ] Test full detection flow without import

### Phase 4: CLI Integration (1 hour)
- [ ] Add `detect` command to `cli.js`
- [ ] Implement `displayDetectionSummary(result)` formatter
- [ ] Add --auto-import flag handling
- [ ] Add --max flag handling
- [ ] Test command with various options

### Phase 5: Testing & Polish (30 min - 1 hour)
- [ ] Test with empty database (first-time use)
- [ ] Test with existing orders (incremental detection)
- [ ] Test --auto-import flag
- [ ] Test error scenarios (network failure, login required)
- [ ] Update README.md with usage examples

## Example Code Snippets

### Database Enhancement (src/database.js)

```javascript
// Add to initializeDatabase()
export function initializeDatabase() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    -- Existing tables...

    -- NEW: Sync metadata tracking
    CREATE TABLE IF NOT EXISTS sync_metadata (
      key TEXT PRIMARY KEY,
      last_sync_time TEXT,
      last_sync_timestamp INTEGER,
      order_count_at_sync INTEGER,
      status TEXT CHECK(status IN ('success', 'partial', 'failed'))
    );

    INSERT OR IGNORE INTO sync_metadata
    (key, last_sync_time, last_sync_timestamp, order_count_at_sync, status)
    VALUES ('waitrose_orders', NULL, 0, 0, 'not_started');
  `);

  return db;
}

// NEW: Get last sync timestamp
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

// NEW: Update sync metadata
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

// NEW: Filter to only new orders
export function filterExistingOrders(db, orders) {
  const checkStmt = db.prepare('SELECT id FROM orders WHERE order_number = ?');

  return orders.filter(order => {
    const existing = checkStmt.get(order.order_number);
    return !existing;
  });
}
```

### Detector Logic (src/detector.js)

```javascript
import { initializeScraper, extractOrdersFromPage } from './chrome-scraper.js';
import {
  getLastSyncTime,
  updateSyncMetadata,
  filterExistingOrders,
  insertOrder,
  insertOrderItems
} from './database.js';

export async function detectNewOrders(db, chromeTools, options = {}) {
  const { autoImport = false, maxOrders = 50 } = options;

  // Initialize scraper
  initializeScraper(chromeTools);

  // Get last sync
  const lastSync = getLastSyncTime(db);
  console.log(`Last sync: ${lastSync.time || 'Never'}`);

  // Navigate and extract
  const tabId = await initializeChrome(chromeTools);
  await navigateToOrders(chromeTools, tabId);

  // Check login
  if (await needsLogin(chromeTools, tabId)) {
    console.log('Please log in to Waitrose...');
    await waitForLogin();
  }

  // Extract orders
  const extractedOrders = await extractOrdersFromPage(chromeTools, tabId);
  console.log(`Found ${extractedOrders.length} orders on page`);

  // Filter to new only
  const newOrders = filterExistingOrders(db, extractedOrders);
  console.log(`${newOrders.length} new orders detected`);

  // Optionally import
  let imported = 0;
  if (autoImport && newOrders.length > 0) {
    for (const order of newOrders) {
      try {
        const orderId = insertOrder(db, order);
        // Note: Full order details would need separate scraping
        imported++;
      } catch (error) {
        console.error(`Failed to import ${order.order_number}:`, error.message);
      }
    }
    updateSyncMetadata(db, imported, 'success');
  }

  return {
    lastSync: lastSync.time,
    totalExtracted: extractedOrders.length,
    newOrders: newOrders.length,
    duplicates: extractedOrders.length - newOrders.length,
    imported: autoImport ? imported : 0,
    importSkipped: !autoImport
  };
}

async function initializeChrome(chromeTools) {
  const context = await chromeTools.tabs_context_mcp({ createIfEmpty: true });
  const tabs = context.availableTabs || [];
  return tabs.length > 0 ? tabs[0].tabId : (await chromeTools.tabs_create_mcp()).tabId;
}

async function navigateToOrders(chromeTools, tabId) {
  await chromeTools.navigate({
    tabId,
    url: 'https://www.waitrose.com/ecom/myaccount/my-orders'
  });
}

async function needsLogin(chromeTools, tabId) {
  const pageText = await chromeTools.get_page_text({ tabId });
  return pageText.toLowerCase().includes('sign in') ||
         pageText.toLowerCase().includes('log in');
}

async function waitForLogin() {
  return new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });
}
```

### CLI Command (cli.js)

```javascript
// Add after existing commands
program
  .command('detect')
  .description('Check for new orders since last scrape')
  .option('--auto-import', 'Automatically import new orders')
  .option('--max <number>', 'Maximum orders to check', '50')
  .action(async (options) => {
    const spinner = ora('Initializing detection...').start();

    try {
      const db = initializeDatabase();

      // Get Chrome MCP tools (would need to be passed from main context)
      const chromeTools = getChromeTools();

      spinner.text = 'Checking for new orders...';
      const result = await detectNewOrders(db, chromeTools, {
        autoImport: options.autoImport,
        maxOrders: parseInt(options.max)
      });

      spinner.succeed('Detection complete');
      displayDetectionSummary(result);

      db.close();
    } catch (error) {
      spinner.fail('Detection failed');
      displayError(error);
      process.exit(1);
    }
  });

function displayDetectionSummary(result) {
  console.log(chalk.bold('\n📋 Detection Summary'));
  console.log('════════════════════════════════════════');
  console.log(`Last sync: ${result.lastSync || 'Never'}`);
  console.log(`Orders checked: ${result.totalExtracted}`);
  console.log(chalk.green(`✓ New orders: ${result.newOrders}`));
  console.log(chalk.gray(`- Already imported: ${result.duplicates}`));

  if (result.importSkipped) {
    console.log(chalk.yellow(`\nℹ  Use --auto-import to save new orders`));
  } else if (result.imported > 0) {
    console.log(chalk.green(`\n✓ Imported ${result.imported} orders`));
  }
}
```

---

**Plan Created:** 2025-01-06
**Target Version:** v0.2
**Related Issues:** N/A (first feature in v0.2)
